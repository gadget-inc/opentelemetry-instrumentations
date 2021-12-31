import { Span } from "@opentelemetry/api";
import { InstrumentationConfig } from "@opentelemetry/instrumentation";
export interface HookInfo {
    payload: any | any[];
}
export declare type HookFunction = (span: Span, hookInfo: HookInfo) => void;
export interface WSInstrumentationConfig extends InstrumentationConfig {
    /** Hook for adding custom attributes before ws sends a message */
    sendHook?: HookFunction;
    /** Hook for adding custom attributes before the event listener (callback) is invoked */
    onHook?: HookFunction;
    /** list of events to ignore tracing on for socket.io listeners */
    onIgnoreEventList?: string[];
}
