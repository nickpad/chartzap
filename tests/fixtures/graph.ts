import { hydrateGraphFromSeed } from "@chartzap/core/schema/seed";
import { northwind } from "./northwind.js";
export const getExampleGraph = (_name: "northwind") => hydrateGraphFromSeed(northwind);
