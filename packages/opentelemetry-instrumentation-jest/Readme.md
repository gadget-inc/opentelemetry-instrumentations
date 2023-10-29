# opentelemetry-instrumentation-jest

Adds opentelemetry tracing instrumentation for Jest tests. Traces each test in a nicely wrapped up root trace.

## Installation

Install the package with

```
npm install opentelemetry-instrumentation-jest
```

or

```
yarn add opentelemetry-instrumentation-jest
```

## Usage

You must do two things to set this library up:

- start using this library's custom Jest environment
- start using this library's custom Jest runtime (via an undocumented option)
- register this library's instrumentations inside a `setupFilesAfterEnv` jest setup file.

Your jest config should look like this:

```javascript
// in jest.config.js
module.exports = {
  // ...
  testEnvironment: "opentelemetry-instrumentation-jest/dist/src/node-environment",
  runtime: "opentelemetry-instrumentation-jest/dist/src/runtime",
  setupFilesAfterEnv: [
    "opentelemetry-instrumentation-jest/dist/src/register",
    // ...
  ],
  // ...
};
```

If you're already using a custom environment, see the [Wrapping another environment](#wrapping-another-environment).

## Wrapping another environment

`opentelemetry-instrumentation-jest` exports environment entrypoints that correctly wrap the `jest-environment-node`, `jest-environment-jsdom`, and `setup-polly-jest`. If you need to use one of these environments, you can use one of the built in exports from this library:

| Environment              | Instrumented Entrypoint                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `jest-environment-node`  | `"opentelemetry-instrumentation-jest/dist/src/node-environment"`  |
| `jest-environment-jsdom` | `"opentelemetry-instrumentation-jest/dist/src/jsdom-environment"` |
| `setup-polly-jest`       | `"opentelemetry-instrumentation-jest/dist/src/setup-polly-jest"`  |

If you're using a different environment however, you must wrap that environment yourself. In your custom environment file, pass the custom environment class to the `instrumentEnvironment` function from this library.

```javascript
import NodeEnvironment from "jest-environment-node";
import { instrumentEnvironment } from "opentelemetry-instrumentation-jest";

class MyCustomEnvironment extends NodeEnvironment {
  // ...
}

// wrap the environment before returning it
export default instrumentEnvironment(MyCustomEnvironment);
```

The returned class will run the correct jest hooks for setting up spans around each test.

## Instrumentation strategy

This library sucked to write and relies on nasty hacks to work. There's three main design goals with it:

- wrap each test's execution in an independent opentelemetry trace, _including_ that test's `beforeEach` etc hooks
- ensure that any spans created during the test's execution belong to that main trace
- ensure instrumentation libraries within the jest test vm work ok

Both otel and jest really fight against doing any this. For the first requirement, the only reliable way to hook into jest's execution at a low-enough layer that all `beforeEach`es etc are all visible is using a custom environment, which lives outside the the test context. Within the test context, I couldn't find a way to register the instrumentation early enough to capture all `beforeAll`/`beforeEach` calls and ensure that they too are included in a test's trace. Instead, we use a jest environment, which gets nice events for `test_start` and `test_done` which wrap the whole stack of stuff the test does.

Adding a test environment is annoying for usage though, as it means wrapping any other test environment you might be using already. And, just a test environment is insufficient -- we need to also set up a trace around each test's execution. Critically, this setup must be done _within_ the same context as the code running the test (and the code under test) so that the parent tracking of all the spans and the trace exporter are all the normal one you might use in your own code. This means we need some code on the outside of jest's test context for the environment events, _and_ on the inside to correctly monkeypatch and set up the otel context.

Otel itself has no way to activate a trace for everything that is happening within a node process for a bit. When jest runs a test, it is a global affair -- it's the only thing going on. This isn't normal for node, but for reading test trace output, is critical -- there shouldn't be some units of work which don't propagate the test trace parent and appear as other root traces. So, we need to resort to mutable context hacks to set a global root trace for each test. Nasty.

Worse (somehow) is the instrumentation strategy. Jest's `require` patches break `require-in-the-middle`, which is the monkeypatching library that all the opentelemetry instrumentation packages use to hook in and modify stuff. `require-in-the-middle`'s hooks never get run when jest in place. So, to allow the instrumentations to modify required modules, this library mocks out `require-in-the-middle` itself, capturing all the module require calls that any instrumentation tries to make. Then, there's a custom runtime subclass which hooks into jest's require mechanism, and gives the hooks a chance to run. It's gross, and it feels bad to patch jest's `require` to allow a different library to patch `require` to then patch other libraries. Really says something about us you know.
