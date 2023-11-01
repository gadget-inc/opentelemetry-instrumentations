"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JestInstrumentation = void 0;
const api_1 = require("@opentelemetry/api");
const instrumentation_1 = require("@opentelemetry/instrumentation");
let originalRootContextMap = null;
/** Instrumentation for the `ws` library WebSocket class */
class JestInstrumentation extends instrumentation_1.InstrumentationBase {
    constructor(config = {}) {
        super("opentelemetry-instrumentation-jest", "0.1.1", config);
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
        console.log("getting tracer provider", { delegate: tracerProvider._delegate });
        console.dir(tracerProvider);
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
        console.log(this.tracerProvider);
        const rootTestSpan = this.tracer.startSpan("jest.test", { attributes }, api_1.ROOT_CONTEXT);
        console.log({ rootTestSpan });
        this._diag.info(`new version 2: starting test '${name}' with root trace ID ${rootTestSpan.spanContext().traceId}`);
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
        console.trace("instrumentation-jest init called", this.tracer, { test: global.test });
        // normally, otel instrumentations should hook into the module at require time. but, jest, as always, is special. because we need to hook into the inner context that tests execute in (where the app code would emit traces), we need to be within jest's managed context triggered in a `setupFilesAfterEnv` or similar. this is early enough to monkeypatch these functions, but, jest has already been required at this point, so we can't hook into the module at require time. instead, we just monkeypatch the globals on instantiation and hope for the best.
        this._wrap(globalThis, "it", this.wrapJestIt.bind(this));
        this._wrap(globalThis, "test", this.wrapJestIt.bind(this));
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
    wrapTest(_name, originalTestFn) {
        const instrumentation = this;
        const newTestFn = Object.assign(function (...args) {
            const rootTestSpan = newTestFn.rootTestSpan;
            if (!rootTestSpan) {
                return originalTestFn.apply(this, args);
            }
            const activeContext = instrumentation.injectTestTagsToContext(instrumentation._config.propagatedTestInfo);
            return api_1.context.with(api_1.trace.setSpan(activeContext, rootTestSpan), () => {
                return originalTestFn.apply(this, args);
            });
        }, {
            // mount instrumentation on patched function for the handleTestEvent
            instrumentation: this,
            // add a slot for the root span so that we can access it in handleTestEvent
            rootTestSpan: undefined,
        });
        return newTestFn;
    }
    injectTestTagsToContext(tags) {
        if (!tags || !Object.keys(tags).length) {
            return api_1.context.active();
        }
        let baggage = api_1.propagation.getBaggage(api_1.context.active()) || api_1.propagation.createBaggage();
        Object.keys(tags).forEach((key) => {
            baggage = baggage.setEntry(key, { value: tags[key] });
        });
        // create a new context with the mutated baggage
        return api_1.propagation.setBaggage(api_1.context.active(), baggage);
    }
}
exports.JestInstrumentation = JestInstrumentation;
//# sourceMappingURL=jestInstrumentation.js.map