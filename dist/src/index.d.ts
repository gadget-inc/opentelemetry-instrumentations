/// <reference types="node" />
import { Span } from "@opentelemetry/api";
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from "@opentelemetry/instrumentation";
import type * as http from "http";
import WS from "ws";
import { WSInstrumentationConfig } from "./types";
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
