type FormulaType = "text" | "number" | "boolean" | "date" | "datetime" | "unknown";

interface FuncGivenArg {
  type: FormulaType;
  literalValue?: string | number | boolean;
}

export type { FormulaType, FuncGivenArg };
