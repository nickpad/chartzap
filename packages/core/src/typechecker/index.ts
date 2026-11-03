import assert from "tiny-invariant";
import type { AST, Column, FunctionCall } from "../formula/ast.js";
import { compileAST, walkAST } from "../formula/compile.js";
import { functionArgLookup, functionLookup } from "../functions/index.js";
import type { Func } from "../functions/index.js";
import type { FormulaType, FuncGivenArg } from "../functions/types.js";
import { ColumnNotFoundError } from "../schema/graph.js";
import type { Graph, GraphNode, Relation } from "../schema/graph.js";

const FORMULA_CONTEXTS = ["column", "filter"] as const;

type FormulaContext = (typeof FORMULA_CONTEXTS)[number];

interface ColumnConfig {
  context: "column";
  graph: Graph;
}

interface FilterConfig {
  context: "filter";
  resultSetColumns: {
    id?: string;
    name: string;
    columnType: FormulaType;
  }[];
}

type TypeCheckerConfig = ColumnConfig | FilterConfig;

type GraphLike = Pick<Graph, "hasNodeByName" | "getNodeByName" | "getColumnByName">;

const NullGraph: GraphLike = {
  hasNodeByName: () => false,
  getNodeByName: () => {
    throw new Error("No graph");
  },
  getColumnByName: () => {
    throw new Error("No graph");
  },
};

type CheckResult =
  | { status: "parse-error" }
  | {
      status: "typecheck-failed";
      errors: { message: string; from: number; to: number }[];
    }
  | {
      status: "ok";
      columnType: FormulaType;
      queryData: QueryData;
      types: Map<number, FormulaType>;
      isMeasure: boolean;
      ast: AST;
      errors: [];
    };

interface TypeError {
  message: string;
  from: number;
  to: number;
}

interface QueryData {
  aggregates: {
    name: string;
    node: GraphNode & { relation: Relation };
    alias: string;
    expression: FunctionCall<AST>;
    condition?: AST;
  }[];
}

class TypeChecker {
  private context: FormulaContext;
  private graph: GraphLike;
  private resultSetColumns: FilterConfig["resultSetColumns"];

  constructor(config: TypeCheckerConfig) {
    this.context = config.context;
    this.graph = config.context === "column" ? config.graph : NullGraph;
    this.resultSetColumns = config.context === "filter" ? config.resultSetColumns : [];
  }

  checkColumn(formulaText: string): CheckResult {
    const compileResult = compileAST(formulaText);

    if (compileResult.isValid === false) {
      return { status: "parse-error" as const };
    }

    const result = this.typecheck(compileResult.ast);

    if (result.errors.length > 0) {
      return { status: "typecheck-failed" as const, errors: result.errors };
    }

    return {
      status: "ok" as const,
      columnType: result.columnType,
      queryData: result.queryData,
      types: result.types,
      isMeasure: result.isMeasure,
      ast: compileResult.ast,
      errors: [],
    };
  }

  private typecheck(ast: AST) {
    const stack: AST[] = [];
    const aggPath: { func: Func; node: FunctionCall<AST> }[] = [];
    const types = new Map<number, FormulaType>();
    const nodeLookup = new Map<number, AST>();
    const errors: TypeError[] = [];
    const queryData: QueryData = { aggregates: [] };
    const aggRefs = new Map<number, Column[]>();
    const aggConditions = new Map<number, AST>();
    let isMeasure = false;
    let aggCounter = 1;

    walkAST(ast, {
      enter: (node) => {
        stack.unshift(node);

        nodeLookup.set(node.id, node);

        if (node.nodeType === "functionCall") {
          const func = functionLookup(node.name);

          if (func?.isAggregate) {
            isMeasure = true;
            aggPath.push({ func, node });
          }
        }

        if (node.arg !== undefined) {
          const func = functionLookup(node.arg.funcName);
          if (func === undefined) {
            return;
          }
          if (node.arg.number >= func.args.length && !func.lastArgRepeats) return;
          const lookup = functionArgLookup(node.arg.funcName, node.arg.number);

          if (lookup.arg.type === "condition") {
            const parentAgg = aggPath[aggPath.length - 1];

            if (parentAgg === undefined) {
              throw new Error(
                `condition arg outside aggregate func: ${lookup.func.name}, arg ${node.arg.number}`,
              );
            }

            if (aggConditions.get(parentAgg.node.id) !== undefined) {
              throw new Error(`multiple conditions given for aggregate func: ${lookup.func.name}`);
            }

            aggConditions.set(parentAgg.node.id, node);
          }
        }

        if (node.nodeType === "column") {
          const parentAgg = aggPath[aggPath.length - 1];
          const isAggArgument = parentAgg?.func.args.some((arg, index) => {
            const expression = parentAgg.node.args[index];
            return (
              arg.type === "aggregate" &&
              expression &&
              node.meta.from >= expression.meta.from &&
              node.meta.to <= expression.meta.to
            );
          });

          if (parentAgg && isAggArgument && this.graph.hasNodeByName(node.graphNode)) {
            const currentModels = aggRefs.get(parentAgg.node.id) ?? [];
            aggRefs.set(parentAgg.node.id, [...currentModels, node]);
          }
        }
      },
      leave: (node) => {
        if (node.nodeType !== "functionCall") {
          return;
        }

        const func = functionLookup(node.name);
        if (func?.isAggregate) {
          aggPath.pop();
          if (aggPath.length > 0) {
            const parent = aggPath[aggPath.length - 1];
            errors.push({
              message: `Cannot call aggregate function ${func.name} inside ${parent.func.name}`,
              from: node.meta.from,
              to: node.meta.to,
            });
          }
        }
      },
    });

    aggRefs.forEach((models, nodeId) => {
      const astNode = nodeLookup.get(nodeId);
      assert(astNode !== undefined && astNode.nodeType === "functionCall");
      const uniqueModels = new Set(models.map((m) => m.graphNode));
      if (uniqueModels.size > 1) {
        const modelsList = Array.from(uniqueModels).sort().join(", ");
        errors.push({
          message: `Aggregate function ${astNode.name} cannot refer to multiple models (${modelsList})`,
          from: astNode.meta.from,
          to: astNode.meta.to,
        });
      } else if (uniqueModels.size === 1) {
        const model = Array.from(uniqueModels)[0];
        const graphNode = this.graph.getNodeByName(model);
        const alias = `${astNode.name} ${model} (${aggCounter})`;
        const condition = aggConditions.get(nodeId);
        queryData.aggregates.push({
          name: astNode.name,
          node: graphNode,
          alias,
          expression: astNode,
          condition,
        });
        aggCounter += 1;
      }
    });

    for (const node of stack) {
      switch (node.nodeType) {
        case "scalar":
          switch (typeof node.value) {
            case "string":
              types.set(node.id, "text");
              break;
            case "number":
              types.set(node.id, "number");
              break;
            case "boolean":
              types.set(node.id, "boolean");
              break;
            default: {
              const exhaustive: never = node.value;
              return exhaustive;
            }
          }
          break;
        case "column":
        case "aggColumn":
          switch (this.context) {
            case "filter":
              errors.push({
                message: "Filters can only refer to columns in the result set",
                from: node.meta.from,
                to: node.meta.to,
              });
              types.set(node.id, "unknown");
              break;
            case "column": {
              if (!this.graph.hasNodeByName(node.graphNode)) {
                errors.push({
                  message: `Unknown table "${node.graphNode}"`,
                  from: node.meta.from,
                  to: node.meta.to,
                });
                types.set(node.id, "unknown");
                break;
              }
              const graphNode = this.graph.getNodeByName(node.graphNode);
              try {
                const column = this.graph.getColumnByName(graphNode.id, node.columnName);
                types.set(node.id, column.dataType);
              } catch (e) {
                if (e instanceof ColumnNotFoundError) {
                  errors.push({
                    message: e.message,
                    from: node.meta.from,
                    to: node.meta.to,
                  });
                  types.set(node.id, "unknown");
                } else {
                  throw e;
                }
              }
              break;
            }
          }
          break;
        case "resultSetColumn":
          switch (this.context) {
            case "column":
              errors.push({
                message: `Cannot use a result set column here (${node.columnName})`,
                from: node.meta.from,
                to: node.meta.to,
              });
              types.set(node.id, "unknown");
              break;
            case "filter": {
              const match = this.resultSetColumns.find((value) => {
                return value.name === node.columnName;
              });
              if (match !== undefined) {
                types.set(node.id, match.columnType);
              } else {
                errors.push({
                  message: `Result set column {${node.columnName}} not found`,
                  from: node.meta.from,
                  to: node.meta.to,
                });
                types.set(node.id, "unknown");
              }
              break;
            }
          }
          break;
        case "functionCall": {
          const funcName = node.name.toUpperCase();
          const signature = functionLookup(funcName);
          if (signature === undefined) {
            errors.push({
              message: `Unknown function name ${node.name}`,
              from: node.meta.from,
              to: node.meta.to,
            });
            types.set(node.id, "unknown");
            break;
          }

          if (signature.isAggregate && this.context !== "column") {
            errors.push({
              message: `Cannot use aggregate functions like ${signature.name} in ${this.context}`,
              from: node.meta.from,
              to: node.meta.to,
            });
          }

          const funcGivenArgs: FuncGivenArg[] = node.args.map((arg) => {
            const t = types.get(arg.id);
            if (t === undefined) {
              throw new Error(`Unknown type for node ${arg.id}`);
            }
            if (arg.nodeType === "scalar") {
              return {
                type: t,
                literalValue: arg.value,
              };
            }
            return { type: t };
          });

          const checkResult = signature.typeCheck(funcGivenArgs);

          for (const message of checkResult.errors) {
            errors.push({
              message,
              from: node.meta.from,
              to: node.meta.to,
            });
          }

          types.set(node.id, checkResult.returnType);
          break;
        }
        case "binaryExpression": {
          const leftType = types.get(node.left.id);
          const rightType = types.get(node.right.id);
          const comparedTypes = [leftType, rightType].join("; ");

          switch (node.expressionType) {
            case "Add":
            case "Subtract":
            case "Multiply":
            case "Divide":
              switch (comparedTypes) {
                case "number; number":
                  types.set(node.id, "number");
                  break;
                default:
                  types.set(node.id, "unknown");
                  errors.push({
                    message: `Cannot ${node.expressionType.toLowerCase()} ${leftType} and ${rightType}`,
                    from: node.meta.from,
                    to: node.meta.to,
                  });
              }
              break;
            case "Equal":
            case "NotEqual":
              switch (comparedTypes) {
                case "number; number":
                case "date; date":
                case "text; text":
                case "boolean; boolean":
                  types.set(node.id, "boolean");
                  break;
                default:
                  types.set(node.id, "unknown");
                  errors.push({
                    message: `Cannot check equality of ${leftType} and ${rightType}`,
                    from: node.meta.from,
                    to: node.meta.to,
                  });
              }
              break;
            case "GreaterThan":
            case "GreaterThanEqual":
            case "LessThan":
            case "LessThanEqual":
              switch (comparedTypes) {
                case "number; number":
                case "date; date":
                  types.set(node.id, "boolean");
                  break;
                default:
                  types.set(node.id, "unknown");
                  errors.push({
                    message: `Cannot compare ${leftType} and ${rightType}`,
                    from: node.meta.from,
                    to: node.meta.to,
                  });
              }
              break;
            case "And":
            case "Or":
              if (leftType !== "boolean" || rightType !== "boolean") {
                errors.push({
                  message: `${node.expressionType.toUpperCase()} requires boolean operands, received ${leftType} and ${rightType}`,
                  from: node.meta.from,
                  to: node.meta.to,
                });
                types.set(node.id, "unknown");
              } else {
                types.set(node.id, "boolean");
              }
              break;
            default: {
              const exhaustive: never = node.expressionType;
              return exhaustive;
            }
          }
          break;
        }
        default: {
          const exhaustive: never = node;
          return exhaustive;
        }
      }
    }

    const columnType = types.get(ast.id) || "unknown";

    if (this.context !== "column" && columnType !== "boolean") {
      errors.push({
        message: `Must return a boolean. This formula returns a ${columnType}.`,
        from: ast.meta.from,
        to: ast.meta.to,
      });
    }

    return { errors, types, queryData, columnType, isMeasure };
  }
}

function buildTypechecker(graph: Graph) {
  const columnChecker = new TypeChecker({ context: "column", graph });

  function checkColumn(formulaText: string): CheckResult {
    return columnChecker.checkColumn(formulaText);
  }

  function checkFilter(
    formulaText: string,
    resultSetColumns: FilterConfig["resultSetColumns"],
  ): CheckResult {
    const filterChecker = new TypeChecker({
      context: "filter",
      resultSetColumns,
    });
    return filterChecker.checkColumn(formulaText);
  }

  return { checkColumn, checkFilter };
}

export { TypeChecker, buildTypechecker, FORMULA_CONTEXTS };
export type { QueryData, CheckResult, FormulaContext };
