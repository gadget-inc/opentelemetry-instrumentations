# opentelemetry-instrumentation-ws

Adds opentelemetry tracing instrumentation for the `ws` library. Traces socket opens, closes, sends, and optionally messages.

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

| Options         | Type                                     | Description                                                                                    |
| --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `sendHook`      | (span: Span, hookInfo: HookInfo) => void | hook for adding custom attributes to the ws send span when a websocket sends a message         |
| `closeHook`     | (span: Span, hookInfo: HookInfo) => void | hook for adding custom attributes to the ws close span when a websocket is imperatively closed |
| `messageEvents` | boolean                                  | should the tracing library add span events for each received message. Default: false           |
