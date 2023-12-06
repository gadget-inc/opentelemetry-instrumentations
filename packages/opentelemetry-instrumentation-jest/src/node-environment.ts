import NodeEnvironment from "jest-environment-node";
import { instrumentEnvironment } from "./jestEnvironment";

export default instrumentEnvironment(NodeEnvironment);
