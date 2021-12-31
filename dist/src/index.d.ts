import { InstrumentationBase, InstrumentationNodeModuleDefinition } from "@opentelemetry/instrumentation";
import WS from "ws";
import { WSInstrumentationConfig } from "./types";
export declare const WSInstrumentationAttributes: {};
/** Instrumentation for the `ws` library WebSocket class */
export declare class WSInstrumentation extends InstrumentationBase<WS> {
    protected _config: WSInstrumentationConfig;
    constructor(config?: WSInstrumentationConfig);
    protected init(): InstrumentationNodeModuleDefinition<WS>[];
    setConfig(config: WSInstrumentationConfig): void;
    private _patchConstructor;
    private _patchOn;
    private _patchSend;
}
