/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/ban-types */
import { context, diag, propagation, Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import { MessagingOperationValues, SemanticAttributes } from "@opentelemetry/semantic-conventions";
import isPromise from "is-promise";
import WS, { WebSocket } from "ws";
import { WSInstrumentationConfig } from "./types";

export const WSInstrumentationAttributes = {};

const normalizeConfig = (config?: WSInstrumentationConfig) => {
  config = Object.assign({}, config);
  if (!Array.isArray(config.onIgnoreEventList)) {
    config.onIgnoreEventList = [];
  }
  return config;
};

const endSpan = (traced: () => any | Promise<any>, span: Span) => {
  try {
    const result = traced();
    if (isPromise(result)) {
      return Promise.resolve(result)
        .catch((err) => {
          if (err) {
            if (typeof err === "string") {
              span.setStatus({ code: SpanStatusCode.ERROR, message: err });
            } else {
              span.recordException(err);
              span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
            }
          }
          throw err;
        })
        .finally(() => span.end());
    } else {
      span.end();
      return result;
    }
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
    span.end();
    throw error;
  }
};

/** Instrumentation for the `ws` library WebSocket class */
export class WSInstrumentation extends InstrumentationBase<WS> {
  protected override _config: WSInstrumentationConfig = {};

  constructor(config: WSInstrumentationConfig = {}) {
    super("opentelemetry-instrumentation-ws", "0.27.0", normalizeConfig(config));
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<WS>(
        "ws",
        [">=7"],
        (moduleExports, moduleVersion) => {
          if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
          }

          if (isWrapped(moduleExports)) {
            throw new Error("Can't double wrap the ws constructor");
          }

          diag.debug(`ws instrumentation: applying patch to ws@${moduleVersion}`);

          const WebSocket = this._patchConstructor(moduleExports as any);

          if (isWrapped(WebSocket.prototype.on)) {
            this._unwrap(WebSocket.prototype, "on");
          }
          this._wrap(WebSocket.prototype, "on", this._patchOn);

          if (isWrapped(WebSocket.prototype.send)) {
            this._unwrap(WebSocket.prototype, "send");
          }
          this._wrap(WebSocket.prototype, "send", this._patchSend);

          return WebSocket as any;
        },
        (moduleExports) => {
          return (moduleExports as any).__original;
        }
      ),
    ];
  }

  override setConfig(config: WSInstrumentationConfig) {
    return super.setConfig(normalizeConfig(config));
  }

  private _patchConstructor(OriginalWebSocket: typeof WebSocket) {
    const self = this;

    const klass = class WebSocket extends OriginalWebSocket {
      constructor(address: string, protocols: any, options: any) {
        let connectingSpan: Span | null = null;
        const parentContext = context.active();
        if (!options) {
          options = {};
        }

        if (address != null) {
          connectingSpan = self.tracer.startSpan(`WS connect`, {
            kind: SpanKind.CLIENT,
            attributes: {
              [SemanticAttributes.MESSAGING_SYSTEM]: "ws",
              [SemanticAttributes.MESSAGING_DESTINATION_KIND]: "websocket",
              [SemanticAttributes.MESSAGING_OPERATION]: "connect",
            },
          });

          if (!options.headers) {
            options.headers = {};
          }

          const requestContext = trace.setSpan(context.active(), connectingSpan);
          propagation.inject(requestContext, options.headers);
        }

        super(address, protocols, options);

        if (connectingSpan) {
          connectingSpan.setAttributes({
            [SemanticAttributes.MESSAGING_DESTINATION]: this.url,
            [SemanticAttributes.MESSAGING_PROTOCOL]: this.protocol,
          });

          this.once("open", () => {
            connectingSpan!.end();
          });

          this.once("error", (error) => {
            connectingSpan!.recordException(error);
            connectingSpan!.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
            connectingSpan!.end();
          });

          context.bind(parentContext, this);
        }
      }
    };

    (klass as any).__original == OriginalWebSocket;
    (klass as any).__wrapped = true;
    return klass;
  }

  private _patchOn = (original: (this: WebSocket, event: any, listener: any) => any) => {
    const self = this;

    return function (this: WebSocket, event: any, originalListener: any) {
      let listener = originalListener;
      if (event == "message") {
        listener = function (this: WebSocket, ...args: any[]) {
          const eventName = event;

          const span: Span = self.tracer.startSpan(`WS ${eventName}`, {
            kind: SpanKind.CONSUMER,
            attributes: {
              [SemanticAttributes.MESSAGING_SYSTEM]: "ws",
              [SemanticAttributes.MESSAGING_DESTINATION]: this.url,
              [SemanticAttributes.MESSAGING_OPERATION]: MessagingOperationValues.RECEIVE,
            },
          });

          if (self._config.onHook) {
            safeExecuteInTheMiddle(
              () => self._config.onHook!(span, { payload: args }),
              (e) => {
                if (e) diag.error(`ws instrumentation: onHook failed`, e);
              },
              true
            );
          }
          return context.with(trace.setSpan(context.active(), span), () => endSpan(() => originalListener.apply(this, args), span));
        };
      }

      return original.call(this, event, listener);
    };
  };

  private _patchSend = (original: (this: WebSocket, data: string, options?: any, callback?: any) => any) => {
    const self = this;

    return function (this: WebSocket, data: string, options?: any, callback?: any) {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }

      const span = self.tracer.startSpan(`WS send`, {
        kind: SpanKind.CLIENT,
        attributes: {
          [SemanticAttributes.MESSAGING_DESTINATION]: this.url,
        },
      });

      if (self._config.sendHook) {
        safeExecuteInTheMiddle(
          () =>
            self._config.sendHook!(span, {
              payload: {
                data,
                options,
              },
            }),
          (e) => {
            if (e) {
              diag.error("ws instrumentation: sendHook failed", e);
            }
          },
          true
        );
      }

      return context.with(trace.setSpan(context.active(), span), () => {
        original.call(this, data, options, (err: Error | null, ...results: any[]) => {
          if (err) {
            if (typeof err === "string") {
              span.setStatus({ code: SpanStatusCode.ERROR, message: err });
            } else {
              span.recordException(err);
              span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
            }
          }
          span.end();
          callback?.(err, ...results);
        });
      });
    };
  };
}
