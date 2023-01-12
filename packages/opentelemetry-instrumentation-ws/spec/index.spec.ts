import pkgJson from "../package.json";
import { WSInstrumentation } from "../src";

describe("WSInstrumentation", () => {
  it("has the correct version", () => {
    const instrumentation = new WSInstrumentation();
    expect(instrumentation.instrumentationVersion).toBe(pkgJson.version);
  });
});
