"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JestInstrumentation = exports.onSpanError = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/ban-types */
const types_1 = require("util/types");
const api_1 = require("@opentelemetry/api");
const instrumentation_1 = require("@opentelemetry/instrumentation");
let originalRootContextMap = null;
const isPromiseLike = (value) => {
    if ((0, types_1.isPromise)(value)) {
        // it's a native Promise
        return true;
    }
    // check if it's thenable
    return !!value && (typeof value === "object" || typeof value === "function") && "then" in value && typeof value.then === "function";
};
const onSpanError = (span, error) => {
    span.recordException(error);
    span.setStatus({ code: api_1.SpanStatusCode.ERROR });
};
exports.onSpanError = onSpanError;
function runWithSpan(span, run) {
    try {
        const result = run();
        // too reduce overhead and keep the same return type, only instantiate a promise if a promise was returned
        if (isPromiseLike(result)) {
            return Promise.resolve(result)
                .catch((err) => {
                (0, exports.onSpanError)(span, err);
                throw err;
            })
                .finally(() => span.end());
        }
        span.end();
        return result;
    }
    catch (err) {
        (0, exports.onSpanError)(span, err);
        span.end();
        throw err;
    }
}
/** Instrumentation for the `ws` library WebSocket class */
class JestInstrumentation extends instrumentation_1.InstrumentationBase {
    constructor(config = {}) {
        super("opentelemetry-instrumentation-jest", "0.1.5", config);
        Object.defineProperty(this, "_config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "tracerProvider", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    setTracerProvider(tracerProvider) {
        super.setTracerProvider(tracerProvider);
        this.tracerProvider = tracerProvider;
    }
    startTestSpan(name) {
        if (!originalRootContextMap) {
            originalRootContextMap = api_1.ROOT_CONTEXT._currentContext;
        }
        const attributes = { "test.name": name, "test.library": "jest" };
        // reset the root context to the untouched, actually-root context for starting the next test's span
        api_1.ROOT_CONTEXT._currentContext = originalRootContextMap;
        // start a new root span for this test
        const rootTestSpan = this.tracer.startSpan("jest.test", { attributes }, api_1.ROOT_CONTEXT);
        this._diag.debug(`starting test '${name}' with root trace ID ${rootTestSpan.spanContext().traceId}`);
        // hack: forcibly set this span into the root context, we want everything that happens during this test to be a child of this span. normally, otel contexts are immutable, but we're doing this because we want any other threads of execution during the test to still belong to this root span
        const newRootContext = api_1.trace.setSpan(api_1.ROOT_CONTEXT, rootTestSpan);
        api_1.ROOT_CONTEXT._currentContext = newRootContext._currentContext;
        return rootTestSpan;
    }
    executeBeforeHook(rootTestSpan, spec) {
        const config = this._config;
        if (!config.beforeHook) {
            return;
        }
        (0, instrumentation_1.safeExecuteInTheMiddle)(() => {
            config.beforeHook(rootTestSpan, spec);
        }, (err) => {
            if (err) {
                this._diag.error(err.message);
            }
        }, true);
    }
    executeAfterHook(rootTestSpan, spec, error) {
        const config = this._config;
        if (!config.afterHook) {
            return;
        }
        (0, instrumentation_1.safeExecuteInTheMiddle)(() => {
            config.afterHook(rootTestSpan, spec, error);
        }, (err) => {
            if (err) {
                this._diag.error(err.message);
            }
        }, true);
    }
    init() {
        // normally, otel instrumentations should hook into the module at require time. but, jest, as always, is special. because we need to hook into the inner context that tests execute in (where the app code would emit traces), we need to be within jest's managed context triggered in a `setupFilesAfterEnv` or similar. this is early enough to monkeypatch these functions, but, jest has already been required at this point, so we can't hook into the module at require time. instead, we just monkeypatch the globals on instantiation and hope for the best.
        for (const testFnName of ["it", "test", "fit", "xit", "xtest"]) {
            this._wrap(globalThis, testFnName, this.wrapJestIt.bind(this));
        }
        for (const lifecycleFnName of ["beforeEach", "beforeAll", "afterEach", "afterAll"]) {
            this._wrap(globalThis, lifecycleFnName, (fn) => this.wrapJestLifecycle(lifecycleFnName, fn));
        }
        return [
            new instrumentation_1.InstrumentationNodeModuleDefinition("jest", [">=29.6"], (moduleExports) => {
                return moduleExports;
            }, (moduleExports) => {
                return moduleExports;
            }),
        ];
    }
    wrapJestIt(original) {
        const instrumentation = this;
        const newFunction = function (name, fn, timeout) {
            if (!fn) {
                return original.apply(this, [name, fn, timeout]);
            }
            const wrappedTest = instrumentation.wrapTest(name, fn);
            return original.apply(this, [name, wrappedTest, timeout]);
        };
        Object.assign(newFunction, original);
        return newFunction;
    }
    wrapJestLifecycle(name, original) {
        const instrumentation = this;
        // new implementation of beforeEach
        const newLifecycle = function (fn, timeout) {
            if (!fn) {
                return original.call(this, fn, timeout);
            }
            // call the original beforeEach with a wrapped version of the callback that starts a span around it
            const wrappedLifecycleFn = () => {
                let parentContext = api_1.context.active();
                const parentSpan = globalThis.__jestRootTestSpan;
                if (parentSpan) {
                    parentContext = api_1.trace.setSpan(parentContext, parentSpan);
                }
                return instrumentation.tracer.startActiveSpan(`jest.${name}`, {}, parentContext, (testSpan) => runWithSpan(testSpan, fn));
            };
            return original.call(this, wrappedLifecycleFn, timeout);
        };
        // copy any other properties like `.skip` over to the new function
        Object.assign(newLifecycle, original);
        return newLifecycle;
    }
    // wrap one of the functions passed to test(...) to instrument it
    wrapTest(_name, originalTestFn) {
        const instrumentation = this;
        const newTestFn = Object.assign(function (...args) {
            const self = this;
            const rootTestSpan = newTestFn.rootTestSpan;
            if (!rootTestSpan) {
                return originalTestFn.apply(self, args);
            }
            return instrumentation.tracer.startActiveSpan("jest.test-function", {}, api_1.trace.setSpan(api_1.context.active(), rootTestSpan), (span) => runWithSpan(span, () => originalTestFn.apply(self, args)));
        }, {
            // mount instrumentation on patched function for the handleTestEvent
            instrumentation: this,
            // add a slot for the root span so that we can access it in handleTestEvent
            rootTestSpan: undefined,
        });
        return newTestFn;
    }
}
exports.JestInstrumentation = JestInstrumentation;
//# sourceMappingURL=jestInstrumentation.js.map