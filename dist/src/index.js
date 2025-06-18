"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSInstrumentation = void 0;
const api_1 = require("@opentelemetry/api");
const core_1 = require("@opentelemetry/core");
const instrumentation_1 = require("@opentelemetry/instrumentation");
const instrumentation_http_1 = require("@opentelemetry/instrumentation-http");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const is_promise_1 = __importDefault(require("is-promise"));
const endSpan = (traced, span) => {
    try {
        const result = traced();
        if ((0, is_promise_1.default)(result)) {
            return Promise.resolve(result)
                .catch((err) => {
                if (err) {
                    if (typeof err === "string") {
                        span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: err });
                    }
                    else {
                        span.recordException(err);
                        span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: err?.message });
                    }
                }
                throw err;
            })
                .finally(() => span.end());
        }
        else {
            span.end();
            return result;
        }
    }
    catch (error) {
        span.recordException(error);
        span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: error?.message });
        span.end();
        throw error;
    }
};
/** Instrumentation for the `ws` library WebSocket class */
class WSInstrumentation extends instrumentation_1.InstrumentationBase {
    constructor(config = {}) {
        super("opentelemetry-instrumentation-ws", "0.5.0", config);
        Object.defineProperty(this, "_config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "_requestSpans", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new WeakMap()
        });
        Object.defineProperty(this, "_patchSend", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (original) => {
                const self = this;
                return function (data, options, callback) {
                    if (typeof options === "function") {
                        callback = options;
                        options = {};
                    }
                    const span = self.tracer.startSpan(`WS send`, {
                        kind: api_1.SpanKind.CLIENT,
                        attributes: {
                            [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION]: this.url,
                        },
                    });
                    if (self._config.sendHook) {
                        (0, instrumentation_1.safeExecuteInTheMiddle)(() => self._config.sendHook(span, {
                            payload: {
                                data,
                                options,
                            },
                        }), (e) => {
                            if (e) {
                                api_1.diag.error("ws instrumentation: sendHook failed", e);
                            }
                        }, true);
                    }
                    return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), () => {
                        original.call(this, data, options, (err, ...results) => {
                            if (err) {
                                if (typeof err === "string") {
                                    span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: err });
                                }
                                else {
                                    span.recordException(err);
                                    span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: err?.message });
                                }
                            }
                            span.end();
                            callback?.(err, ...results);
                        });
                    });
                };
            }
        });
        Object.defineProperty(this, "_patchClose", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (original) => {
                const self = this;
                return function (...args) {
                    const span = self.tracer.startSpan(`WS close`, {
                        kind: api_1.SpanKind.CLIENT,
                        attributes: {
                            [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION]: this.url,
                        },
                    });
                    if (self._config.closeHook) {
                        (0, instrumentation_1.safeExecuteInTheMiddle)(() => self._config.closeHook(span, { payload: args }), (e) => {
                            if (e) {
                                api_1.diag.error("ws instrumentation: closeHook failed", e);
                            }
                        }, true);
                    }
                    return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), () => endSpan(() => original.apply(this, args), span));
                };
            }
        });
        Object.defineProperty(this, "_patchIncomingRequestEmit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (original) => {
                const self = this;
                return function incomingRequest(event, ...args) {
                    // Only traces upgrade events
                    if (event !== "upgrade") {
                        return original.call(this, event, ...args);
                    }
                    const request = args[0];
                    const emitter = this;
                    const ctx = api_1.propagation.extract(api_1.ROOT_CONTEXT, request.headers);
                    const span = self.tracer.startSpan(`HTTP GET WS`, {
                        kind: api_1.SpanKind.SERVER,
                        attributes: (0, instrumentation_http_1.getIncomingRequestAttributes)(request, {
                            component: "WS",
                            hookAttributes: {
                                [semantic_conventions_1.SemanticAttributes.NET_HOST_IP]: request.socket.localAddress,
                                [semantic_conventions_1.SemanticAttributes.NET_HOST_PORT]: request.socket.localPort,
                                [semantic_conventions_1.SemanticAttributes.NET_PEER_IP]: request.socket.remoteAddress,
                                [semantic_conventions_1.SemanticAttributes.NET_PEER_PORT]: request.socket.remotePort,
                            },
                        }),
                    }, ctx);
                    const rpcMetadata = {
                        type: core_1.RPCType.HTTP,
                        span,
                    };
                    self._requestSpans.set(request, span);
                    return api_1.context.with((0, core_1.setRPCMetadata)(api_1.trace.setSpan(ctx, span), rpcMetadata), () => {
                        try {
                            return original.call(emitter, event, ...args);
                        }
                        catch (error) {
                            span.recordException(error);
                            span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: error?.message });
                            span.end();
                            self._requestSpans.delete(request);
                            throw error;
                        }
                    });
                };
            }
        });
        Object.defineProperty(this, "_patchServerHandleUpgrade", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (original) => {
                const self = this;
                return function (request, socket, upgradeHead, callback) {
                    const parentSpan = self._requestSpans.get(request);
                    const span = self.tracer.startSpan(`WS upgrade`, {
                        kind: api_1.SpanKind.SERVER,
                        attributes: (0, instrumentation_http_1.getIncomingRequestAttributes)(request, {
                            component: "WS",
                            hookAttributes: {
                                [semantic_conventions_1.SemanticAttributes.NET_HOST_IP]: request.socket.localAddress,
                                [semantic_conventions_1.SemanticAttributes.NET_HOST_PORT]: request.socket.localPort,
                                [semantic_conventions_1.SemanticAttributes.NET_PEER_IP]: request.socket.remoteAddress,
                                [semantic_conventions_1.SemanticAttributes.NET_PEER_PORT]: request.socket.remotePort,
                            },
                        }),
                    });
                    if (self._config.handleUpgradeHook) {
                        (0, instrumentation_1.safeExecuteInTheMiddle)(() => self._config.handleUpgradeHook(span, { payload: { request, socket, upgradeHead } }), (e) => {
                            if (e) {
                                api_1.diag.error("ws instrumentation: handleUpgradeHook failed", e);
                            }
                        }, true);
                    }
                    return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), () => {
                        return endSpan(() => original.call(this, request, socket, upgradeHead, function (websocket, request) {
                            parentSpan?.setAttributes({
                                [semantic_conventions_1.SemanticAttributes.HTTP_STATUS_CODE]: 101,
                            });
                            if (parentSpan) {
                                const actualEndTime = new Date();
                                const originalEnd = parentSpan.end;
                                parentSpan.end = (_endtime) => originalEnd(actualEndTime); // Set the end time to the current time but don't end the span yet
                                self._requestSpans.delete(request);
                            }
                            return callback.call(this, websocket, request);
                        }), span);
                    });
                };
            }
        });
    }
    init() {
        const self = this;
        return [
            new instrumentation_1.InstrumentationNodeModuleDefinition("ws", [">=7"], (moduleExports, moduleVersion) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                if ((0, instrumentation_1.isWrapped)(moduleExports)) {
                    throw new Error("Can't double wrap the ws constructor");
                }
                api_1.diag.debug(`ws instrumentation: applying patch to ws@${moduleVersion}`);
                const WebSocket = this._patchConstructor(moduleExports);
                if (self._config.sendSpans) {
                    if ((0, instrumentation_1.isWrapped)(WebSocket.prototype.send)) {
                        this._unwrap(WebSocket.prototype, "send");
                    }
                    this._wrap(WebSocket.prototype, "send", this._patchSend);
                }
                if ((0, instrumentation_1.isWrapped)(WebSocket.prototype.close)) {
                    this._unwrap(WebSocket.prototype, "close");
                }
                this._wrap(WebSocket.prototype, "close", this._patchClose);
                if ((0, instrumentation_1.isWrapped)(WebSocket.Server.prototype.handleUpgrade)) {
                    this._unwrap(WebSocket.Server.prototype, "handleUpgrade");
                }
                this._wrap(WebSocket.Server.prototype, "handleUpgrade", this._patchServerHandleUpgrade);
                return WebSocket;
            }, (moduleExports) => {
                return moduleExports.__original;
            }),
            new instrumentation_1.InstrumentationNodeModuleDefinition("http", ["*"], (moduleExports) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                api_1.diag.debug(`ws instrumentation: applying patch to http`);
                this._wrap(moduleExports.Server.prototype, "emit", this._patchIncomingRequestEmit);
                return moduleExports;
            }, (moduleExports) => {
                if (moduleExports === undefined)
                    return;
                this._diag.debug(`Removing patch for http`);
                this._unwrap(moduleExports.Server.prototype, "emit");
            }),
            new instrumentation_1.InstrumentationNodeModuleDefinition("https", ["*"], (moduleExports) => {
                if (moduleExports === undefined || moduleExports === null) {
                    return moduleExports;
                }
                api_1.diag.debug(`ws instrumentation: applying patch to https`);
                this._wrap(moduleExports.Server.prototype, "emit", this._patchIncomingRequestEmit);
                return moduleExports;
            }, (moduleExports) => {
                if (moduleExports === undefined)
                    return;
                this._diag.debug(`Removing patch for https`);
                this._unwrap(moduleExports.Server.prototype, "emit");
            }),
        ];
    }
    _patchConstructor(OriginalWebSocket) {
        const self = this;
        const klass = class WebSocket extends OriginalWebSocket {
            constructor(address, protocols, options) {
                let connectingSpan = null;
                if (!options) {
                    options = {};
                }
                if (address != null) {
                    connectingSpan = self.tracer.startSpan(`WS connect`, {
                        kind: api_1.SpanKind.CLIENT,
                        attributes: {
                            [semantic_conventions_1.SemanticAttributes.MESSAGING_SYSTEM]: "ws",
                            [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION_KIND]: "websocket",
                            [semantic_conventions_1.SemanticAttributes.MESSAGING_OPERATION]: "connect",
                        },
                    });
                    if (!options.headers) {
                        options.headers = {};
                    }
                    const requestContext = api_1.trace.setSpan(api_1.context.active(), connectingSpan);
                    api_1.propagation.inject(requestContext, options.headers);
                }
                super(address, protocols, options);
                Object.defineProperty(this, "_parentContext", {
                    enumerable: true,
                    configurable: true,
                    writable: true,
                    value: void 0
                });
                Object.defineProperty(this, "_openSpan", {
                    enumerable: true,
                    configurable: true,
                    writable: true,
                    value: void 0
                });
                this._parentContext = api_1.context.active();
                if (connectingSpan) {
                    connectingSpan.setAttributes({
                        [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION]: this.url,
                        [semantic_conventions_1.SemanticAttributes.MESSAGING_PROTOCOL]: this.protocol,
                    });
                    const connectionErrorListener = (error) => {
                        connectingSpan.recordException(error);
                        connectingSpan.setStatus({ code: api_1.SpanStatusCode.ERROR, message: error?.message });
                        connectingSpan.end();
                    };
                    this.once("error", connectionErrorListener);
                    this.once("open", () => {
                        connectingSpan.end();
                        this.removeEventListener("error", connectionErrorListener);
                    });
                }
                this.once("open", () => {
                    this._openSpan = self.tracer.startSpan(`WS open`, {
                        kind: connectingSpan ? api_1.SpanKind.CLIENT : api_1.SpanKind.SERVER,
                        attributes: {
                            [semantic_conventions_1.SemanticAttributes.MESSAGING_SYSTEM]: "ws",
                            [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION_KIND]: "websocket",
                        },
                    });
                    // we don't really have anything to do with the new context returned here, just let it float
                    api_1.trace.setSpan(api_1.context.active(), this._openSpan);
                });
                this.once("error", (error) => {
                    this._openSpan?.recordException(error);
                    this._openSpan?.setStatus({ code: api_1.SpanStatusCode.ERROR, message: error?.message });
                });
                this.once("close", (close) => {
                    this._openSpan?.setAttributes({
                        "ws.close.code": close.code,
                        "ws.close.reason": close.reason,
                        "ws.close.wasClean": close.wasClean,
                    });
                    this._openSpan?.end();
                });
                if (self._config.messageEvents) {
                    this.on("message", (_message) => {
                        this._openSpan?.addEvent("ws.incoming-message", {
                            [semantic_conventions_1.SemanticAttributes.MESSAGING_SYSTEM]: "ws",
                        });
                    });
                }
            }
        };
        klass.__original == OriginalWebSocket;
        klass.__wrapped = true;
        return klass;
    }
}
exports.WSInstrumentation = WSInstrumentation;
//# sourceMappingURL=index.js.map