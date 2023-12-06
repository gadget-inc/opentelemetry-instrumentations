import type { Circus } from "@jest/types";
import type { ProxyTracerProvider, Span, TracerProvider } from "@opentelemetry/api";
import { SpanStatusCode, diag, propagation } from "@opentelemetry/api";
import type { EnvironmentContext, JestEnvironment, JestEnvironmentConfig } from "@jest/environment";
import { type ExtendedJestTestFn } from "./jestInstrumentation";
import type { Instrumentation } from "@opentelemetry/instrumentation";

export type JestEnvironmentConstructor = { new (config: JestEnvironmentConfig, _context: EnvironmentContext): JestEnvironment };

/** Wrap another jest environment with the required jest instrumentation logic */
export const instrumentEnvironment = (
  Base: JestEnvironmentConstructor,
  reregisterInstrumentations?: () => Instrumentation[]
): JestEnvironmentConstructor => {
  class InstrumentedEnvironment extends Base {
    onTrace:
      | ((
          span: Span,
          event: {
            name: "test_done";
            test: Circus.TestEntry;
          }
        ) => void)
      | null = null;

    tracerProvider: TracerProvider | null = null;
    reregistered = false;

    constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
      super(config, context);

      if (config.projectConfig.testEnvironmentOptions.onTrace) {
        this.onTrace = config.projectConfig.testEnvironmentOptions.onTrace as any;
      }
    }

    handleTestEvent: JestEnvironment["handleTestEvent"] = (event, state) => {
      // for each test_start and test_done event, start a root span
      // expose it to the inner test world as the `.rootTestSpan` property on the test function itself
      if (event.name === "test_start" || event.name == "test_done") {
        const fn = event.test.fn as ExtendedJestTestFn;
        const { instrumentation } = fn;

        if (instrumentation) {
          this.tracerProvider ??= instrumentation.tracerProvider;

          // set the right tracer provider on any instrumentations set up in the outer environment
          if (!this.reregistered && reregisterInstrumentations) {
            const instrumentations = reregisterInstrumentations();
            for (const instrumentationToReRegister of instrumentations) {
              instrumentationToReRegister.setTracerProvider(instrumentation.tracerProvider);
              instrumentationToReRegister.setMeterProvider(instrumentation.meterProvider);
            }
            // @ts-expect-error is private but we need to get it
            propagation.setGlobalPropagator(instrumentation.innerPropagationAPI()._getGlobalPropagator());
            this.reregistered = true;
          }

          if (event.name === "test_start") {
            const rootTestSpan = instrumentation.startTestSpan(event.test.name);
            instrumentation.executeBeforeHook(rootTestSpan, undefined);
            fn.rootTestSpan = rootTestSpan;
            this.global.__jestRootTestSpan = rootTestSpan;
          } else {
            const { rootTestSpan } = fn;

            if (rootTestSpan) {
              if (event.name === "test_done") {
                const err = event.test.errors[0];
                instrumentation.executeAfterHook(rootTestSpan, undefined, err);
                if (err) {
                  rootTestSpan.recordException(err);
                  rootTestSpan.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: err.message,
                  });
                }
                rootTestSpan.end();

                if (this.onTrace) {
                  this.onTrace(rootTestSpan, event);
                }
              }
            }
          }
        } else {
          diag.error(`No instrumentation found for test '${event.test.name}'`);
        }
      }

      if (event.name == "run_finish" && this.tracerProvider) {
        // shuck the proxy from a tracer provider so we can get to the `forceFlush` function if it exists
        let realTracer: TracerProvider = this.tracerProvider;
        if ("getDelegate" in realTracer) {
          realTracer = (realTracer as unknown as ProxyTracerProvider).getDelegate();
        }

        // flush the tracer
        if ("forceFlush" in realTracer) {
          (realTracer as any).forceFlush().then(
            () => {
              diag.debug(`flushed tracer after jest test finished`);
            },
            (err: Error) => {
              diag.error(`Error flushing tracer provider on jest shutdown`, err);
            }
          );
        }
      }

      return super.handleTestEvent?.(event as any, state);
    };
  }

  return InstrumentedEnvironment;
};
