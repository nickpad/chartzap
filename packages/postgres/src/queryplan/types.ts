import type { AST } from "@chartzap/core/formula/ast";
import type { FormulaType } from "@chartzap/core/functions/types";
import type { QueryData } from "@chartzap/core/typechecker";

interface CheckedColumn {
  id: string;
  name: string;
  formula: string;
  sortDirection: "asc" | "desc" | "none";
  expression: AST;
  isMeasure: boolean;
  columnType: FormulaType;
  aggregates: QueryData["aggregates"];
}

type AggregateLookup = Map<string, QueryData["aggregates"][number]>;

interface BuildQueryPlanConfig {
  columns: CheckedColumn[];
  filter?: AST;
  limit?: number;
  graph: import("@chartzap/core/schema/graph").Graph;
}

interface FinalQuery {
  main: MainQuery;
  ctes: CTE[];
}

interface Query {
  where?: AST;
  groupBy?: number[];
  orderBy?: OrderBy[];
}

interface CTEQuery extends Query {
  select: Array<FormulaColumn | StandardColumn>;
  from: From;
}

interface MainQuery extends Query {
  select: Array<FormulaColumn | StandardColumn>;
  from: From;
  limit?: number;
}

interface CTE {
  alias: string;
  query: CTEQuery;
}

interface From {
  relation: string;
  schema?: string;
  alias?: string;
  joins: Join[];
  singleRow?: boolean; // When true, renders as a single-row VALUES clause
}

interface OrderBy {
  alias: string;
  direction: "asc" | "desc";
}

interface FormulaColumn {
  expression: AST;
  alias: string;
}

interface StandardColumn {
  attribute: string;
  relation: string;
  alias: string;
}

interface Join {
  join: "inner" | "left";
  targetRelation: string;
  targetSchema?: string;
  conditions: JoinCondition[];
}

interface JoinCondition {
  sourceRelation: string;
  sourceAttribute: string;
  targetAttribute: string;
  joinNulls: boolean;
}

function isFormulaColumn(column: FormulaColumn | StandardColumn): column is FormulaColumn {
  return "expression" in column;
}

function isStandardColumn(column: FormulaColumn | StandardColumn): column is StandardColumn {
  return "attribute" in column;
}

export type {
  CheckedColumn,
  AggregateLookup,
  BuildQueryPlanConfig,
  FinalQuery,
  CTE,
  CTEQuery,
  MainQuery,
  Query,
  From,
  OrderBy,
  FormulaColumn,
  StandardColumn,
  Join,
  JoinCondition,
};

export { isFormulaColumn, isStandardColumn };
