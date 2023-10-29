import type { JestEnvironment, Module } from "@jest/environment";
import moduleDetailsFromPath from "module-details-from-path";
import type Resolver from "jest-resolve";
import type { Config } from "@jest/types";
import JestRuntime from "jest-runtime";
import type { ShouldInstrumentOptions, ScriptTransformer } from "@jest/transform";

type InitialModule = Omit<Module, "require" | "parent" | "paths">;

// version of https://github.com/elastic/require-in-the-middle/blob/main/index.js#L104C1-L113C4 that just captures the desired require hooks so we can apply them within jest's require implementation
class Hook {
  static hooks: Hook[] = [];

  readonly modules: string[] | undefined;
  readonly options: { internals?: true };
  readonly onRequire: (exports: any, name: string, basedir: string | undefined) => any;

  constructor(modulesOrOptionsOrFunction: any, optionsOrFunction?: any, onRequire?: any) {
    if (onRequire) {
      this.modules = modulesOrOptionsOrFunction;
      this.options = optionsOrFunction;
      this.onRequire = onRequire;
    } else if (optionsOrFunction) {
      if (Array.isArray(modulesOrOptionsOrFunction)) {
        this.modules = modulesOrOptionsOrFunction;
        this.options = {};
        this.onRequire = optionsOrFunction;
      } else {
        this.modules = undefined;
        this.options = modulesOrOptionsOrFunction;
        this.onRequire = optionsOrFunction;
      }
    } else {
      this.modules = undefined;
      this.options = {};
      this.onRequire = modulesOrOptionsOrFunction;
    }

    if (typeof this.options !== "object") throw new Error(`error parsing insane arguments for options: ${typeof this.options}`);
    if (typeof this.onRequire !== "function") throw new Error(`error parsing insane arguments for func: ${typeof this.onRequire}`);
    if (this.modules && !Array.isArray(this.modules)) throw new Error(`error parsing insane arguments for modules: ${this.modules}`);

    Hook.hooks.push(this);
  }

  unhook() {
    Hook.hooks = Hook.hooks.filter((h) => h !== this);
  }
}

/** Patched version of jest runtime that supports require-in-the-middle for otel instrumentation support */
// @ts-expect-error we're overriding a private method on this class
export default class InstrumentedRuntime extends JestRuntime {
  constructor(
    config: Config.ProjectConfig,
    environment: JestEnvironment,
    resolver: Resolver,
    transformer: ScriptTransformer,
    cacheFS: Map<string, string>,
    coverageOptions: ShouldInstrumentOptions,
    testPath: string,
    globalConfig?: Config.GlobalConfig
  ) {
    super(config, environment, resolver, transformer, cacheFS, coverageOptions, testPath, globalConfig);

    environment.global.MOCK_REQUIRE_IN_THE_MIDDLE = {
      Hook,
    };
  }

  // override this function to apply any require-in-the-middle hooks to modules required by jest
  private _loadModule(
    localModule: InitialModule,
    from: string,
    moduleName: string | undefined,
    modulePath: string,
    options: any | undefined,
    moduleRegistry: any
  ) {
    // @ts-expect-error we're overriding a private method
    super._loadModule(localModule, from, moduleName, modulePath, options, moduleRegistry);

    if (localModule.loaded) {
      if (moduleName) {
        const stat = moduleDetailsFromPath(localModule.path);
        if (stat === undefined) {
          return exports; // abort if filename could not be parsed
        }

        for (const hook of Hook.hooks) {
          if (hook.modules && !hook.modules.includes(moduleName)) continue;
          // apply the require hook, we use defineProperty to override modules that have getters for their exports set
          Object.defineProperty(localModule, "exports", {
            value: hook.onRequire(localModule.exports, moduleName, stat.basedir),
          });
        }
      }
    }
  }
}
