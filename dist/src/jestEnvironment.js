"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instrumentEnvironment = void 0;
const api_1 = require("@opentelemetry/api");
/** Wrap another jest environment with the required jest instrumentation logic */
const instrumentEnvironment = (Base) => {
    class InstrumentedEnvironment extends Base {
        constructor(config, context) {
            super(config, context);
            Object.defineProperty(this, "onTrace", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: null
            });
            Object.defineProperty(this, "tracerProvider", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: null
            });
            Object.defineProperty(this, "handleTestEvent", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: (event, state) => {
                    // for each test_start and test_done event, start a root span
                    // expose it to the inner test world as the `.rootTestSpan` property on the test function itself
                    if (event.name === "test_start" || event.name == "test_done") {
                        const fn = event.test.fn;
                        const { instrumentation } = fn;
                        if (instrumentation) {
                            this.tracerProvider ?? (this.tracerProvider = instrumentation.tracerProvider);
                            if (event.name === "test_start") {
                                const rootTestSpan = instrumentation.startTestSpan(event.test.name);
                                instrumentation.executeBeforeHook(rootTestSpan, undefined);
                                fn.rootTestSpan = rootTestSpan;
                            }
                            else {
                                const { rootTestSpan } = fn;
                                if (rootTestSpan) {
                                    if (event.name === "test_done") {
                                        const err = event.test.errors[0];
                                        instrumentation.executeAfterHook(rootTestSpan, undefined, err);
                                        if (err) {
                                            rootTestSpan.recordException(err);
                                            rootTestSpan.setStatus({
                                                code: api_1.SpanStatusCode.ERROR,
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
                        }
                        else {
                            api_1.diag.error(`No instrumentation found for test '${event.test.name}'`);
                        }
                    }
                    if (event.name == "run_finish" && this.tracerProvider) {
                        // shuck the proxy from a tracer provider so we can get to the `forceFlush` function if it exists
                        let realTracer = this.tracerProvider;
                        if ("getDelegate" in realTracer) {
                            realTracer = realTracer.getDelegate();
                        }
                        // flush the tracer
                        if ("forceFlush" in realTracer) {
                            realTracer.forceFlush().then(() => {
                                api_1.diag.debug(`flushed tracer after jest test finished`);
                            }, (err) => {
                                api_1.diag.error(`Error flushing tracer provider on jest shutdown`, err);
                            });
                        }
                    }
                    return super.handleTestEvent?.(event, state);
                }
            });
            if (config.projectConfig.testEnvironmentOptions.onTrace) {
                this.onTrace = config.projectConfig.testEnvironmentOptions.onTrace;
            }
        }
    }
    return InstrumentedEnvironment;
};
exports.instrumentEnvironment = instrumentEnvironment;
//# sourceMappingURL=jestEnvironment.js.map