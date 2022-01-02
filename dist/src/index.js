"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSInstrumentation = exports.WSInstrumentationAttributes = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/ban-types */
const api_1 = require("@opentelemetry/api");
const instrumentation_1 = require("@opentelemetry/instrumentation");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const is_promise_1 = __importDefault(require("is-promise"));
exports.WSInstrumentationAttributes = {};
const normalizeConfig = (config) => {
    config = Object.assign({}, config);
    if (!Array.isArray(config.onIgnoreEventList)) {
        config.onIgnoreEventList = [];
    }
    return config;
};
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
        super("opentelemetry-instrumentation-ws", "0.27.0", normalizeConfig(config));
        Object.defineProperty(this, "_config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "_patchOn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (original) => {
                const self = this;
                return function (event, originalListener) {
                    let listener = originalListener;
                    if (event == "message") {
                        listener = function (...args) {
                            const eventName = event;
                            const span = self.tracer.startSpan(`WS ${eventName}`, {
                                kind: api_1.SpanKind.CONSUMER,
                                attributes: {
                                    [semantic_conventions_1.SemanticAttributes.MESSAGING_SYSTEM]: "ws",
                                    [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION]: this.url,
                                    [semantic_conventions_1.SemanticAttributes.MESSAGING_OPERATION]: semantic_conventions_1.MessagingOperationValues.RECEIVE,
                                },
                            });
                            if (self._config.onHook) {
                                (0, instrumentation_1.safeExecuteInTheMiddle)(() => self._config.onHook(span, { payload: args }), (e) => {
                                    if (e)
                                        api_1.diag.error(`ws instrumentation: onHook failed`, e);
                                }, true);
                            }
                            return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), () => endSpan(() => originalListener.apply(this, args), span));
                        };
                    }
                    return original.call(this, event, listener);
                };
            }
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
    }
    init() {
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
                if ((0, instrumentation_1.isWrapped)(WebSocket.prototype.on)) {
                    this._unwrap(WebSocket.prototype, "on");
                }
                this._wrap(WebSocket.prototype, "on", this._patchOn);
                if ((0, instrumentation_1.isWrapped)(WebSocket.prototype.send)) {
                    this._unwrap(WebSocket.prototype, "send");
                }
                this._wrap(WebSocket.prototype, "send", this._patchSend);
                return WebSocket;
            }, (moduleExports) => {
                return moduleExports.__original;
            }),
        ];
    }
    setConfig(config) {
        return super.setConfig(normalizeConfig(config));
    }
    _patchConstructor(OriginalWebSocket) {
        const self = this;
        const klass = class WebSocket extends OriginalWebSocket {
            constructor(address, protocols, options) {
                let connectingSpan = null;
                const parentContext = api_1.context.active();
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
                if (connectingSpan) {
                    connectingSpan.setAttributes({
                        [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION]: this.url,
                        [semantic_conventions_1.SemanticAttributes.MESSAGING_PROTOCOL]: this.protocol,
                    });
                    this.once("open", () => {
                        connectingSpan.end();
                    });
                    this.once("error", (error) => {
                        connectingSpan.recordException(error);
                        connectingSpan.setStatus({ code: api_1.SpanStatusCode.ERROR, message: error?.message });
                        connectingSpan.end();
                    });
                    api_1.context.bind(parentContext, this);
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