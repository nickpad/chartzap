import type { AST } from "./formula/ast.js";
import { updateExpression, walkAST } from "./formula/compile.js";
import { functionLookup } from "./functions/index.js";
import type { FormulaType } from "./functions/types.js";
import { GraphError } from "./schema/graph.js";
import type { Graph } from "./schema/graph.js";
import { buildTypechecker } from "./typechecker/index.js";
import type { CheckResult, QueryData } from "./typechecker/index.js";

export interface Diagnostic {
  code:
    | "PARSE_ERROR"
    | "TYPE_ERROR"
    | "INVALID_QUERY"
    | "UNSUPPORTED_AGGREGATE"
    | "UNSUPPORTED_TABLE_ALIAS"
    | "INVALID_VALUE"
    | string;
  message: string;
  from: number;
  to: number;
  column?: string;
}
export interface QueryColumn {
  id?: string;
  name: string;
  formula: string;
  sortDirection?: "asc" | "desc" | "none";
}
export interface CheckedFormulaColumn {
  id: string;
  name: string;
  formula: string;
  sortDirection: "asc" | "desc" | "none";
  expression: AST;
  isMeasure: boolean;
  columnType: FormulaType;
  aggregates: QueryData["aggregates"];
}
export interface CompilerInput {
  graph: Graph;
  columns: CheckedFormulaColumn[];
  filter?: AST;
  limit?: number;
}
export interface QueryCompiler<Plan> {
  compile(input: CompilerInput): {
    plan: Plan;
    sql: { text: string; parameters: (string | number | boolean)[] };
  };
}
export interface CompileQueryInput<Plan> {
  columns: QueryColumn[];
  filter?: string;
  limit?: number;
  compiler: QueryCompiler<Plan>;
}
export function formulaDiagnostics(result: CheckResult, formula: string): Diagnostic[] {
  if (result.status === "parse-error")
    return [
      { code: "PARSE_ERROR", message: "Invalid formula syntax", from: 0, to: formula.length },
    ];
  if (result.status === "typecheck-failed")
    return result.errors.map((error) => ({ code: "TYPE_ERROR", ...error }));
  return [];
}
export function createFormulaEngine({ graph }: { graph: Graph }) {
  const checker = buildTypechecker(graph);
  function compileQuery<Plan>(input: CompileQueryInput<Plan>) {
    const diagnostics: Diagnostic[] = [];
    const add = (code: string, message: string) =>
      diagnostics.push({ code, message, from: 0, to: 0 });
    if (input.columns.length === 0) add("INVALID_QUERY", "At least one output column is required");
    if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 0))
      add("INVALID_QUERY", "limit must be a nonnegative safe integer");
    const ids = new Set<string>();
    const names = new Set<string>();
    const columns: CheckedFormulaColumn[] = [];
    for (const column of input.columns) {
      const id = column.id ?? column.name;
      if (
        !id ||
        !column.name ||
        ids.has(id) ||
        names.has(column.name) ||
        id.includes("\0") ||
        new TextEncoder().encode(id).length > 63
      )
        add(
          "INVALID_QUERY",
          "Column IDs and names must be nonempty and unique; IDs must fit 63 UTF-8 bytes and contain no NUL characters",
        );
      ids.add(id);
      names.add(column.name);
      const result = checker.checkColumn(column.formula);
      diagnostics.push(
        ...formulaDiagnostics(result, column.formula).map((d) => ({ ...d, column: column.name })),
      );
      if (result.status !== "ok") continue;
      let aggregateCalls = 0;
      let aggregateDepth = 0;
      walkAST(result.ast, {
        enter(node) {
          if (
            node.nodeType === "scalar" &&
            ((typeof node.value === "number" && !Number.isFinite(node.value)) ||
              (typeof node.value === "string" && node.value.includes("\0")))
          )
            add(
              "INVALID_VALUE",
              "PostgreSQL scalar values must be finite and contain no NUL characters",
            );
          if (node.nodeType === "functionCall" && functionLookup(node.name)?.isAggregate) {
            aggregateCalls++;
            aggregateDepth++;
          }
          if (node.nodeType === "column" && result.isMeasure && aggregateDepth === 0)
            add(
              "UNSUPPORTED_MEASURE",
              "Column references in measures must be inside aggregate arguments",
            );
        },
        leave(node) {
          if (node.nodeType === "functionCall" && functionLookup(node.name)?.isAggregate)
            aggregateDepth--;
        },
      });
      if (result.isMeasure && aggregateCalls !== result.queryData.aggregates.length)
        add("UNSUPPORTED_AGGREGATE", "An aggregate must reference a schema column");
      columns.push({
        ...column,
        id,
        sortDirection: column.sortDirection ?? "none",
        expression: result.ast,
        isMeasure: result.isMeasure,
        columnType: result.columnType,
        aggregates: result.queryData.aggregates,
      });
    }
    let filter: AST | undefined;
    if (input.filter !== undefined && input.filter.trim() !== "") {
      const result = checker.checkFilter(input.filter, columns);
      diagnostics.push(...formulaDiagnostics(result, input.filter));
      if (result.status === "ok") {
        const idsByName = new Map(columns.map((c) => [c.name, c.id]));
        filter = updateExpression(result.ast, (node) =>
          node.nodeType === "resultSetColumn"
            ? { ...node, columnName: idsByName.get(node.columnName)! }
            : node,
        );
      }
    }
    if (diagnostics.length) return { ok: false as const, diagnostics };
    try {
      const compiled = input.compiler.compile({ graph, columns, filter, limit: input.limit });
      return { ok: true as const, ...compiled, columns, filter, diagnostics: [] };
    } catch (error) {
      if (!(error instanceof GraphError)) throw error;
      return {
        ok: false as const,
        diagnostics: [{ code: error.code, message: error.message, from: 0, to: 0 }],
      };
    }
  }
  return { ...checker, compileQuery };
}
