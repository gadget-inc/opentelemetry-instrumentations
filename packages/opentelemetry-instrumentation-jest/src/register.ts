/* eslint-disable @typescript-eslint/no-var-requires */
jest.mock("require-in-the-middle", () => (global as any).MOCK_REQUIRE_IN_THE_MIDDLE);

const { registerInstrumentations } = require("@opentelemetry/instrumentation");
const { JestInstrumentation } = require("./jestInstrumentation");

const instrumentation = new JestInstrumentation();
registerInstrumentations({
  instrumentations: [instrumentation],
});
