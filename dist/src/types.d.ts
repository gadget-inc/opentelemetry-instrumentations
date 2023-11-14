import type { Span } from "@opentelemetry/api";
import type { InstrumentationConfig } from "@opentelemetry/instrumentation";
/**
 * Function that can be used to add custom attributes to span when a test starts
 * @param span - The span created for the current test, on which attributes can be set
 * @param spec - Jest spec object
 */
export interface JestInstrumentationBeforeHook {
    (span: Span, spec: any): void;
}
/**
 * Function that can be used to add custom attributes to span when a test finishes
 * @param span - The span created for the current test, on which attributes can be set
 * @param test - Jest spec object
 * @param error - Error thrown by the test
 */
export interface JestInstrumentationAfterHook {
    (span: Span, spec: any, error?: Error): void;
}
export interface JestInstrumentationConfig extends InstrumentationConfig {
    /**
     * Hook that allows adding custom span attributes based on jest spec data
     * before the test starts.
     *
     * @default undefined
     */
    beforeHook?: JestInstrumentationBeforeHook;
    /**
     * Hook that allows adding custom span attributes based on jest spec data
     * after the test finishes.
     *
     * @default undefined
     */
    afterHook?: JestInstrumentationAfterHook;
}
