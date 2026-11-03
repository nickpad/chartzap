import type { FuncArg, Spec } from "./index.js";
import { funcDefs } from "./index.js";

type FuncArgDisplayTypeMatch =
  | { match: "is"; type: string }
  | { match: "oneOf"; type: string[] }
  | { match: "literal"; type: (string | number | boolean)[] };

interface FuncArgDisplay {
  name: string;
  description: string;
  type: "standard" | "aggregate" | "condition";
  typeMatch?: FuncArgDisplayTypeMatch;
}

interface FuncDisplay {
  name: string;
  description: string;
  args: FuncArgDisplay[];
  lastArgRepeats: boolean;
}

type FuncDisplayMap = Record<string, FuncDisplay>;

function serializeArg(arg: FuncArg): FuncArgDisplay {
  if (arg.type === "condition") {
    return {
      name: arg.name,
      description: arg.description,
      type: arg.type,
    };
  }
  return {
    name: arg.name,
    description: arg.description,
    type: arg.type,
    typeMatch: {
      match: arg.typeMatch.match,
      type: arg.typeMatch.type,
    } as FuncArgDisplayTypeMatch,
  };
}

function serializeSpec(spec: Spec): FuncDisplay {
  return {
    name: spec.name,
    description: spec.description,
    args: spec.args.map(serializeArg),
    lastArgRepeats: spec.lastArgRepeats,
  };
}

function buildFuncDisplayMap(): FuncDisplayMap {
  const map: FuncDisplayMap = {};
  for (const spec of funcDefs) {
    map[spec.name.toUpperCase()] = serializeSpec(spec);
  }
  return map;
}

export { type FuncArgDisplay, type FuncDisplay, type FuncDisplayMap, buildFuncDisplayMap };
