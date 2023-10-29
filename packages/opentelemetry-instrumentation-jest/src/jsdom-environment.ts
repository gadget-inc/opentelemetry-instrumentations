import JSDOMEnvironment from "jest-environment-jsdom";
import { instrumentEnvironment } from "./jestEnvironment";

export default instrumentEnvironment(JSDOMEnvironment);
