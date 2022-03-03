import { Span } from "@opentelemetry/api";
import { InstrumentationConfig } from "@opentelemetry/instrumentation";

export interface HookInfo {
  payload: any | any[];
}

export type HookFunction = (span: Span, hookInfo: HookInfo) => void;

export interface WSInstrumentationConfig extends InstrumentationConfig {
  /** generate spans for each sent websocket message */
  sendSpans?: boolean;
  /** include span events for individual incoming websocket messages */
  messageEvents?: boolean;
  /** Hook for adding custom attributes before ws sends a message */
  sendHook?: HookFunction;
  /** Hook for adding custom attributes before ws closes a socket */
  closeHook?: HookFunction;
  /** Hook for adding custom attributes before a ws server upgrades a request */
  handleUpgradeHook?: HookFunction;
}
