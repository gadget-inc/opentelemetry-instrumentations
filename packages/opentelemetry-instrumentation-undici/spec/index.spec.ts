import pkgJson from "../package.json";
import { UndiciInstrumentation } from "../src";

describe("UndiciInstrumentation", () => {
  it("has the correct version", () => {
    const instrumentation = new UndiciInstrumentation();
    expect(instrumentation.instrumentationVersion).toBe(pkgJson.version);
  });
});
