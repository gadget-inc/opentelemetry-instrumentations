/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/ban-types */
import type { Span } from "@opentelemetry/api";
import { context, diag, propagation, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from "@opentelemetry/instrumentation";
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";
import type { IncomingMessage } from "http";
import type * as Undici from "undici";
import type { UndiciInstrumentationConfig } from "./types";

export const endSpan = (span: Span, err: NodeJS.ErrnoException | null | undefined) => {
  if (err) {
    span.recordException(err);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
  }
  span.end();
};

/** Instrumentation for the `ws` library WebSocket class */
export class UndiciInstrumentation extends InstrumentationBase<typeof Undici> {
  protected override _config: UndiciInstrumentationConfig = {};
  protected _requestSpans = new WeakMap<IncomingMessage, Span>();

  constructor(config: UndiciInstrumentationConfig = {}) {
    super("opentelemetry-instrumentation-undici", "0.2.1", config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof Undici>(
        "undici",
        [">=4"],
        (moduleExports, moduleVersion) => {
          if (moduleExports === undefined || moduleExports === null) {
            return moduleExports;
          }

          diag.debug(`undici instrumentation: applying patch to undici@${moduleVersion}`);

          if (isWrapped(moduleExports.Client.prototype.dispatch)) {
            this._unwrap(moduleExports.Client.prototype, "dispatch");
          }
          this._wrap(moduleExports.Client.prototype, "dispatch", this._patchDispatch);

          return moduleExports;
        },
        (moduleExports) => {
          if (moduleExports === undefined) return;
          diag.debug("Removing patch for undici");
          this._unwrap(moduleExports.Client.prototype, "dispatch");
        }
      ),
    ];
  }

  private _patchDispatch = (
    original: (this: Undici.Dispatcher, options: Undici.Dispatcher.DispatchOptions, handlers: Undici.Dispatcher.DispatchHandlers) => boolean
  ) => {
    const self = this;
    return function (
      this: Undici.Dispatcher,
      options: Undici.Dispatcher.DispatchOptions,
      handlers: Undici.Dispatcher.DispatchHandlers
    ): boolean {
      let currentSpan: Span | undefined = self.startSpan(options, this);
      const dispatcher = this;

      const requestContext = trace.setSpan(context.active(), currentSpan);
      options.headers ??= {};
      propagation.inject(requestContext, options.headers);

      const oldOnConnect = handlers.onConnect;
      const oldOnError = handlers.onError;
      const oldOnHeaders = handlers.onHeaders;
      const oldOnUpgrade = handlers.onUpgrade;
      const oldOnComplete = handlers.onComplete;

      handlers.onConnect = function (abort) {
        if (!currentSpan) {
          currentSpan = self.startSpan(options, dispatcher);
        }

        oldOnConnect?.call(this, abort);
      };
      handlers.onError = function (error) {
        if (currentSpan) {
          endSpan(currentSpan, error);
          currentSpan = undefined;
        }
        oldOnError?.call(this, error);
      };

      handlers.onHeaders = function (statusCode, headers, resume) {
        if (currentSpan) {
          currentSpan.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, statusCode);
        }
        if (oldOnHeaders) {
          return oldOnHeaders.call(this, statusCode, headers, resume);
        } else {
          return true;
        }
      };
      handlers.onUpgrade = function (statusCode, headers, socket) {
        if (currentSpan) {
          currentSpan.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, statusCode);
          endSpan(currentSpan, undefined);
        }
        oldOnUpgrade?.call(this, statusCode, headers, socket);
      };
      handlers.onComplete = function (trailers) {
        if (currentSpan) {
          endSpan(currentSpan, null);
          currentSpan = undefined;
        }
        oldOnComplete?.call(this, trailers);
      };

      return original.call(this, options, handlers);
    };
  };

  private startSpan(options: Undici.Dispatcher.DispatchOptions, dispatcher: Undici.Dispatcher) {
    const span = this.tracer.startSpan(`HTTP ${options.method}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        [SemanticAttributes.HTTP_URL]: String(options.origin),
        [SemanticAttributes.HTTP_METHOD]: options.method,
        [SemanticAttributes.HTTP_TARGET]: options.path,
        "http.client": "undici",
      },
    });

    if (this._config.requestHook) {
      safeExecuteInTheMiddle(
        () =>
          this._config.requestHook!(span, {
            dispatcher,
            options,
          }),
        (e) => {
          if (e) {
            diag.error("undici instrumentation: request hook failed", e);
          }
        },
        true
      );
    }

    return span;
  }
}
