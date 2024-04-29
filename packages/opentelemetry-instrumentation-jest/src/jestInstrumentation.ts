/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/ban-types */
import { isPromise } from "util/types";
import type { MeterProvider, Span } from "@opentelemetry/api";
import { SpanStatusCode, context, ROOT_CONTEXT, trace, propagation } from "@opentelemetry/api";
import { InstrumentationBase, InstrumentationNodeModuleDefinition, safeExecuteInTheMiddle } from "@opentelemetry/instrumentation";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { JestInstrumentationConfig } from "./types";

export type JestCallbackFn = ((cb: () => void) => void | undefined) | (() => PromiseLike<unknown>);
/**
 * A test function passed to `global.test` or `global.it` that's been extended with instrumentation properties
 */
export type ExtendedJestTestFn = JestCallbackFn & {
  instrumentation: JestInstrumentation;
  rootTestSpan?: Span;
};

let originalRootContextMap: Map<unknown, unknown> | null = null;

const isPromiseLike = <T = any>(value: unknown): value is PromiseLike<T> => {
  if (isPromise(value)) {
    // it's a native Promise
    return true;
  }

  // check if it's thenable
  return !!value && (typeof value === "object" || typeof value === "function") && "then" in value && typeof value.then === "function";
};

export const onSpanError = (span: Span, error: any) => {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR });
};

function runWithSpan<T>(span: Span, run: () => T): T | Promise<T> {
  try {
    const result = run();

    // too reduce overhead and keep the same return type, only instantiate a promise if a promise was returned
    if (isPromiseLike(result)) {
      return Promise.resolve(result)
        .catch((err) => {
          onSpanError(span, err);
          throw err;
        })
        .finally(() => span.end());
    }

    span.end();
    return result;
  } catch (err: any) {
    onSpanError(span, err);
    span.end();
    throw err;
  }
}

/** Instrumentation for the `jest` test library */
export class JestInstrumentation extends InstrumentationBase {
  protected override _config: JestInstrumentationConfig = {};
  tracerProvider!: NodeTracerProvider;
  meterProvider!: MeterProvider;

  constructor(config: JestInstrumentationConfig = {}) {
    super("opentelemetry-instrumentation-jest", "0.1.7", config);
  }

  override setTracerProvider(tracerProvider: NodeTracerProvider) {
    super.setTracerProvider(tracerProvider);
    this.tracerProvider = tracerProvider;
  }

  override setMeterProvider(meterProvider: MeterProvider) {
    super.setMeterProvider(meterProvider);
    this.meterProvider = meterProvider;
  }

  innerPropagationAPI() {
    return propagation;
  }

  innerTraceAPI() {
    return trace;
  }

  startTestSpan(name: string): Span {
    if (!originalRootContextMap) {
      originalRootContextMap = (ROOT_CONTEXT as any)._currentContext;
    }
    const attributes = { "test.name": name, "test.library": "jest" };

    // reset the root context to the untouched, actually-root context for starting the next test's span
    (ROOT_CONTEXT as any)._currentContext = originalRootContextMap;

    // start a new root span for this test
    const rootTestSpan = this.tracer.startSpan("jest.test", { attributes }, ROOT_CONTEXT);
    this._diag.debug(`starting test '${name}' with root trace ID ${rootTestSpan.spanContext().traceId}`);

    // hack: forcibly set this span into the root context, we want everything that happens during this test to be a child of this span. normally, otel contexts are immutable, but we're doing this because we want any other threads of execution during the test to still belong to this root span
    const newRootContext = trace.setSpan(ROOT_CONTEXT, rootTestSpan);
    (ROOT_CONTEXT as any)._currentContext = (newRootContext as any)._currentContext;

    return rootTestSpan;
  }

  executeBeforeHook(rootTestSpan: Span, spec: any) {
    const { beforeHook } = this._config;
    if (!beforeHook) {
      return;
    }

    safeExecuteInTheMiddle(
      () => {
        beforeHook(rootTestSpan, spec);
      },
      (err) => {
        if (err) {
          this._diag.error(err.message);
        }
      },
      true
    );
  }

  executeAfterHook(rootTestSpan: Span, spec: any, error?: Error) {
    const { afterHook } = this._config;
    if (!afterHook) {
      return;
    }

    safeExecuteInTheMiddle(
      () => {
        afterHook(rootTestSpan, spec, error);
      },
      (err) => {
        if (err) {
          this._diag.error(err.message);
        }
      },
      true
    );
  }

  protected init() {
    // normally, otel instrumentations should hook into the module at require time. but, jest, as always, is special. because we need to hook into the inner context that tests execute in (where the app code would emit traces), we need to be within jest's managed context triggered in a `setupFilesAfterEnv` or similar. this is early enough to monkeypatch these functions, but, jest has already been required at this point, so we can't hook into the module at require time. instead, we just monkeypatch the globals on instantiation and hope for the best.
    for (const testFnName of ["it", "test", "fit", "xit", "xtest"] as const) {
      this._wrap(globalThis, testFnName, this.wrapJestIt.bind(this));
    }

    for (const lifecycleFnName of ["beforeEach", "beforeAll", "afterEach", "afterAll"] as const) {
      this._wrap(globalThis, lifecycleFnName, (fn) => this.wrapJestLifecycle(lifecycleFnName, fn));
    }

    return [
      new InstrumentationNodeModuleDefinition(
        "jest",
        [">=29.6"],
        (moduleExports) => {
          return moduleExports;
        },
        (moduleExports) => {
          return moduleExports;
        }
      ),
    ];
  }

  private wrapJestIt(original: jest.It): jest.It {
    const instrumentation = this;

    const newFunction = function (this: any, name: string, fn?: () => any | Promise<any>, timeout?: number) {
      if (!fn) {
        return original.apply(this, [name, fn, timeout]);
      }

      const wrappedTest = instrumentation.wrapTest(name, fn);
      return original.apply(this, [name, wrappedTest, timeout]);
    };
    Object.assign(newFunction, original);
    return newFunction as any as jest.It;
  }

  private wrapJestLifecycle(name: string, original: jest.Lifecycle): jest.Lifecycle {
    const instrumentation = this;

    // new implementation of beforeEach
    const newLifecycle = function (this: any, fn?: () => any | Promise<any>, timeout?: number) {
      if (!fn) {
        return original.call(this, fn as any, timeout);
      }

      // call the original beforeEach with a wrapped version of the callback that starts a span around it
      const wrappedLifecycleFn: JestCallbackFn = () => {
        let parentContext = context.active();
        const parentSpan = (globalThis as any).__jestRootTestSpan as Span | undefined;
        if (parentSpan) {
          parentContext = trace.setSpan(parentContext, parentSpan);
        }

        return instrumentation.tracer.startActiveSpan(`jest.${name}`, {}, parentContext, (testSpan) => runWithSpan(testSpan, fn));
      };

      return original.call(this, wrappedLifecycleFn, timeout);
    };

    // copy any other properties like `.skip` over to the new function
    Object.assign(newLifecycle, original);

    return newLifecycle as any as jest.Lifecycle;
  }

  // wrap one of the functions passed to test(...) to instrument it
  private wrapTest(_name: string, originalTestFn: JestCallbackFn): ExtendedJestTestFn {
    const instrumentation = this;

    const newTestFn = Object.assign(
      function (this: any, ...args: any[]) {
        const self = this;
        const rootTestSpan = newTestFn.rootTestSpan;
        if (!rootTestSpan) {
          return (originalTestFn as any).apply(self, args);
        }

        return instrumentation.tracer.startActiveSpan("jest.test-function", {}, trace.setSpan(context.active(), rootTestSpan), (span) =>
          runWithSpan(span, () => (originalTestFn as any).apply(self, args))
        );
      } as JestCallbackFn,
      {
        // mount instrumentation on patched function for the handleTestEvent
        instrumentation: this,
        // add a slot for the root span so that we can access it in handleTestEvent
        rootTestSpan: undefined,
      }
    );

    return newTestFn;
  }
}
