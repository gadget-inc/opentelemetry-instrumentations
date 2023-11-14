import type { EnvironmentContext, JestEnvironment, JestEnvironmentConfig } from "@jest/environment";
export type JestEnvironmentConstructor = {
    new (config: JestEnvironmentConfig, _context: EnvironmentContext): JestEnvironment;
};
/** Wrap another jest environment with the required jest instrumentation logic */
export declare const instrumentEnvironment: (Base: JestEnvironmentConstructor) => JestEnvironmentConstructor;
