# opentelemetry-instrumentation-undici

Adds opentelemetry tracing instrumentation for the `undici` library. Traces outgoing requests.

## Installation

Install the package with

```
npm install opentelemetry-instrumentation-undici
```

or

```
yarn add opentelemetry-instrumentation-undici
```

## Usage

You must register the intstrumentation using the OpenTelemetry Node SDK, and you must take care to do this as soon as possible so the patches to the `undici` library are made before your app's code requires the library.

```typescript
import { UndiciInstrumentation } from "opentelemetry-instrumentation-undici";

import { registerInstrumentations } from '@opentelemetry/instrumentation';

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    new UndiciInstrumentation({
      // see below for configuration options
    })
  ]
});
```

## Config

The `ws` instrumentation has few options available to choose from. You can set the following:

| Options       | Type                                     | Description                                                                              |
| ------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `requestHook` | (span: Span, hookInfo: HookInfo) => void | hook for adding custom attributes to the http.request span when a undici makes a request |
