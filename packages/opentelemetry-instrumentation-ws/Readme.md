# opentelemetry-instrumentation-ws

Adds opentelemetry tracing instrumentation for the `ws` library. Traces socket opens, closes, sends, and optionally messages for the `WebSocket` constructor, and traces upgrades that happen on `http.Server`, `https.Server`, and `WebSocket.Server`.

## Installation

Install the package with

```
npm install opentelemetry-instrumentation-ws
```

or

```
yarn add opentelemetry-instrumentation-ws
```

## Usage

You must register the intstrumentation using the OpenTelemetry Node SDK, and you must take care to do this as soon as possible so the patches to the `ws` library are made before your app's code requires the library.

```typescript
import { WSInstrumentation } from "opentelemetry-instrumentation-ws";

import { registerInstrumentations } from '@opentelemetry/instrumentation';

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    new WSInstrumentation({
      // see below for configuration options
    })
  ]
});
```

## Config

The `ws` instrumentation has few options available to choose from. You can set the following:

| Options             | Type                                     | Description                                                                                                    |
| ------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `sendSpans`         | boolean                                  | should the tracing library add spans for each sent message. Default: false                                     |
| `messageEvents`     | boolean                                  | should the tracing library add span events for each incoming message. Default: false                           |
| `sendHook`          | (span: Span, hookInfo: HookInfo) => void | hook for adding custom attributes to the ws send span when a websocket sends a message                         |
| `closeHook`         | (span: Span, hookInfo: HookInfo) => void | hook for adding custom attributes to the ws close span when a websocket is imperatively closed                 |
| `handleUpgradeHook` | (span: Span, hookInfo: HookInfo) => void | hook for adding custom attributes to the ws.Server handleUpgrade span when a socket is opened against a server |
