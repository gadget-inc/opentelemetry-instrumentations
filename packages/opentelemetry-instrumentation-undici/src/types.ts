import { Span } from "@opentelemetry/api";
import { InstrumentationConfig } from "@opentelemetry/instrumentation";
import { Dispatcher } from "undici";

export interface HookInfo {
  dispatcher: Dispatcher;
  options: Dispatcher.DispatchOptions;
}

export type HookFunction = (span: Span, hookInfo: HookInfo) => void;

export interface UndiciInstrumentationConfig extends InstrumentationConfig {
  /** Hook for adding custom attributes before undici makes a request */
  requestHook?: HookFunction;
}
