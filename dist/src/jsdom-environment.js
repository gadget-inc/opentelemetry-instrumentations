"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jest_environment_jsdom_1 = __importDefault(require("jest-environment-jsdom"));
const jestEnvironment_1 = require("./jestEnvironment");
exports.default = (0, jestEnvironment_1.instrumentEnvironment)(jest_environment_jsdom_1.default);
//# sourceMappingURL=jsdom-environment.js.map