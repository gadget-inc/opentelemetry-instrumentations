import { Span } from "@opentelemetry/api";
import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface HookInfo {
  payload: any | any[];
}

export type HookFunction = (span: Span, hookInfo: HookInfo) => void;

export interface WSInstrumentationConfig extends InstrumentationConfig {
  /** Hook for adding custom attributes before ws sends a message */
  sendHook?: HookFunction;
  /** Hook for adding custom attributes before ws closes a socket */
  closeHook?: HookFunction;
  /** include span events for individual websocket messages */
  messageEvents?: boolean;
}
