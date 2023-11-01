"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const instrumentation_1 = require("@opentelemetry/instrumentation");
const jestInstrumentation_1 = require("./jestInstrumentation");
const instrumentation = new jestInstrumentation_1.JestInstrumentation();
console.log("registering instrumentation", instrumentation);
(0, instrumentation_1.registerInstrumentations)({
    instrumentations: [instrumentation],
});
//# sourceMappingURL=register.js.map