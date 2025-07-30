/// <reference types="node" />
import type { Span } from "@opentelemetry/api";
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from "@opentelemetry/instrumentation";
import type * as http from "http";
import type WS from "ws";
import type { WSInstrumentationConfig } from "./types";
/** Instrumentation for the `ws` library WebSocket class */
export declare class WSInstrumentation extends InstrumentationBase<WS> {
    protected _config: WSInstrumentationConfig;
    protected _requestSpans: WeakMap<http.IncomingMessage, Span>;
    constructor(config?: WSInstrumentationConfig);
    protected init(): (InstrumentationNodeModuleDefinition<WS> | InstrumentationNodeModuleDefinition<typeof http>)[];
    private _patchConstructor;
    private _patchSend;
    private _patchClose;
    private _patchIncomingRequestEmit;
    private _patchServerHandleUpgrade;
}
/**
 * Context keys for the WSInstrumentation.
 */
export declare const WSInstrumentationContext: Readonly<{
    /**
     * Whether the "WS connect" span is a root span.
     */
    CONNECT_ROOT: symbol;
    /**
     * Whether the "WS open" span is a root span.
     */
    OPEN_ROOT: symbol;
    /**
     * Whether the "WS send" span is a root span.
     */
    SEND_ROOT: symbol;
    /**
     * Whether the "WS close" span is a root span.
     */
    CLOSE_ROOT: symbol;
    /**
     * Whether the "WS upgrade" span is a root span.
     */
    UPGRADE_ROOT: symbol;
}>;
export type WSInstrumentationContext = (typeof WSInstrumentationContext)[keyof typeof WSInstrumentationContext];
/**
 * Makes all "WS connect" spans created in the callback be root spans.
 * @param callback - The callback to execute.
 * @returns The result of the callback.
 */
export declare function withWSConnectRoot<T>(callback: () => T): T;
/**
 * Makes all "WS open" spans created in the callback be root spans.
 * @param callback - The callback to execute.
 * @returns The result of the callback.
 */
export declare function withWSOpenRoot<T>(callback: () => T): T;
/**
 * Makes all "WS send" spans created in the callback be root spans.
 * @param callback - The callback to execute.
 * @returns The result of the callback.
 */
export declare function withWSSendRoot<T>(callback: () => T): T;
/**
 * Makes all "WS close" spans created in the callback be root spans.
 * @param callback - The callback to execute.
 * @returns The result of the callback.
 */
export declare function withWSCloseRoot<T>(callback: () => T): T;
/**
 * Makes all "WS upgrade" spans created in the callback be root spans.
 * @param callback - The callback to execute.
 * @returns The result of the callback.
 */
export declare function withWSUpgradeRoot<T>(callback: () => T): T;
