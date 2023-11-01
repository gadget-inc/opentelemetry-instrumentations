import type { Span } from "@opentelemetry/api";
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from "@opentelemetry/instrumentation";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { JestInstrumentationConfig } from "./types";
export type JestTestFn = ((cb: () => void) => void | undefined) | (() => PromiseLike<unknown>);
/**
 * A test function passed to `global.test` or `global.it` that's been extended with instrumentation properties
 */
export type ExtendedJestTestFn = JestTestFn & {
    instrumentation: JestInstrumentation;
    rootTestSpan?: Span;
};
/** Instrumentation for the `ws` library WebSocket class */
export declare class JestInstrumentation extends InstrumentationBase {
    protected _config: JestInstrumentationConfig;
    tracerProvider: NodeTracerProvider;
    constructor(config?: JestInstrumentationConfig);
    setTracerProvider(tracerProvider: NodeTracerProvider): void;
    startTestSpan(name: string): Span;
    executeBeforeHook(rootTestSpan: Span, spec: any): void;
    executeAfterHook(rootTestSpan: Span, spec: any, error?: Error): void;
    protected init(): InstrumentationNodeModuleDefinition<unknown>[];
    private wrapJestIt;
    private wrapTest;
    private injectTestTagsToContext;
}
