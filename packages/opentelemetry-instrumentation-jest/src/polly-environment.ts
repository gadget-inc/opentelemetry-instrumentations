import PollyEnvironment from "setup-polly-jest/jest-environment-node";
import { instrumentEnvironment } from "./jestEnvironment";

export default instrumentEnvironment(PollyEnvironment);
