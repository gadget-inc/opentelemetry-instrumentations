import pkgJson from "../package.json";
import { JestInstrumentation } from "../src/jestInstrumentation";

describe("JestInstrumentation", () => {
  it("has the correct version", () => {
    const instrumentation = new JestInstrumentation();
    expect(instrumentation.instrumentationVersion).toBe(pkgJson.version);
  });
});
