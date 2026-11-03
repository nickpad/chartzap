import { aggregateFunctions } from "./aggregate.js";
import { dateTimeFunctions } from "./datetime.js";
import { logicalFunctions } from "./logical.js";
import { numericFunctions } from "./numeric.js";
import { makeTypeCheck } from "./standard-type-check.js";
import { textFunctions } from "./text.js";
import type { FormulaType, FuncGivenArg } from "./types.js";

const funcNames = [
  // Numeric
  "Abs",
  "Ceiling",
  "Floor",
  "Trunc",
  // Text
  "Concat",
  "Contains",
  "EndsWith",
  "Lower",
  "SplitPart",
  "StartsWith",
  "Upper",
  // Date
  "MakeDate",
  "DateAdd",
  "DateDiff",
  "Day",
  "Week",
  "Month",
  "Quarter",
  "Year",
  "Today",
  // Aggregates
  "Avg",
  "AvgIf",
  "Count",
  "CountIf",
  "CountDistinct",
  "CountDistinctIf",
  "Max",
  "MaxIf",
  "Median",
  "Min",
  "MinIf",
  "Mode",
  "Percentile",
  "Sum",
  "SumIf",
  // Logical
  "If",
  "IsNull",
  "Not",
  "Coalesce",
] as const;

type FunctionName = (typeof funcNames)[number];

type KnownFormulaType = Exclude<FormulaType, "unknown">;

type CustomChecker = (
  thisArg: FuncGivenArg,
  allArgs: readonly FuncGivenArg[],
  argIndex: number,
) => string | undefined;

type FuncSpecArgType =
  | {
      match: "is";
      type: KnownFormulaType | "any";
      customChecker?: CustomChecker;
    }
  | { match: "oneOf"; type: KnownFormulaType[]; customChecker?: CustomChecker }
  | { match: "literal"; type: (string | number | boolean)[] };

interface BaseArg {
  name: string;
  description: string;
}

interface StandardArg extends BaseArg {
  type: "standard";
  typeMatch: FuncSpecArgType;
}

interface AggregateArg extends BaseArg {
  type: "aggregate";
  typeMatch: FuncSpecArgType;
}

// Conditions do not take a typeMatch, as they must always be boolean.
interface ConditionArg extends BaseArg {
  type: "condition";
}

type FuncArg = StandardArg | AggregateArg | ConditionArg;

type TypeChecker = (givenTypes: readonly FuncGivenArg[]) => CheckResult;

type CustomReturnType = (givenArgs: readonly FuncGivenArg[]) => FormulaType;

interface Spec {
  name: string;
  description: string;
  args: FuncArg[];
  isAggregate: boolean;
  returnType: FormulaType | CustomReturnType;
  optionalArgs: number;
  lastArgRepeats: boolean;
  aggregateDefault?: number;
}

interface Func extends Spec {
  typeCheck: TypeChecker;
}

interface CheckResult {
  errors: string[];
  returnType: FormulaType;
}

type CustomTypeChecks = Partial<Record<FunctionName, TypeChecker>>;

const funcDefs: Spec[] = [
  ...numericFunctions,
  ...textFunctions,
  ...aggregateFunctions,
  ...logicalFunctions,
  ...dateTimeFunctions,
];

const functions: Func[] = funcDefs.map((def) => {
  return { ...def, typeCheck: makeTypeCheck(def) };
});

const funcByName = new Map(functions.map((f) => [f.name.toUpperCase(), f]));

function functionLookup(name: string) {
  return funcByName.get(name.toUpperCase());
}

function functionArgLookup(name: string, argNumber: number) {
  const func = functionLookup(name);
  if (func === undefined) {
    throw new Error(`Unknown function: ${name}`);
  }
  if (argNumber >= func.args.length && func.lastArgRepeats === true) {
    argNumber = func.args.length - 1;
  }
  const arg = func.args[argNumber];
  if (arg === undefined) {
    throw new Error(`Function ${name} does not have an argument ${argNumber}`);
  }
  return { func, arg };
}

export {
  type FuncArg,
  type CheckResult,
  type CustomTypeChecks,
  type Func,
  type FunctionName,
  type Spec,
  type FuncSpecArgType,
  funcNames,
  funcDefs,
  functions,
  functionLookup,
  functionArgLookup,
};
