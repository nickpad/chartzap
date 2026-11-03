import type { AST, Column } from "@chartzap/core/formula/ast";
import { updateExpression, walkAST } from "@chartzap/core/formula/compile";
import { functionLookup } from "@chartzap/core/functions";
import { GraphError } from "@chartzap/core/schema/graph";
import type { Graph, GraphNodeID } from "@chartzap/core/schema/graph";
import invariant from "tiny-invariant";

import type {
  AggregateLookup,
  BuildQueryPlanConfig,
  CTE,
  CheckedColumn,
  FinalQuery,
  FormulaColumn,
  StandardColumn,
} from "./types.js";

function buildQueryPlan(config: BuildQueryPlanConfig): FinalQuery {
  const { columns: inputColumns, filter, graph } = config;

  // Sort by stable ID so the same query has the same plan.
  const columns = [...inputColumns]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((column, columnIndex) => ({
      ...column,
      aggregates: column.aggregates.map((aggregate, aggregateIndex) => ({
        ...aggregate,
        alias: `a${columnIndex}_${aggregateIndex}`,
      })),
    }));

  if (columns.length === 0) {
    return {
      main: {
        select: [],
        from: { relation: "", joins: [] },
        limit: config.limit,
      },
      ctes: [],
    };
  }

  if (config.limit !== undefined && (!Number.isSafeInteger(config.limit) || config.limit < 0)) {
    throw new RangeError("limit must be a nonnegative safe integer");
  }
  const aggregateLookup: AggregateLookup = new Map();

  for (const column of columns) {
    for (const agg of column.aggregates) {
      const key = [column.id, agg.expression.id].join(":");
      aggregateLookup.set(key, agg);
    }
  }

  const [dimColumns, measureColumns] = partitionColumns(columns);
  const cteList = makeCTEs(dimColumns, measureColumns, graph, aggregateLookup);

  for (const cte of cteList.ctes) {
    const tables = [cte.query.from.relation, ...cte.query.from.joins.map((j) => j.targetRelation)];
    if (new Set(tables).size !== tables.length)
      throw new GraphError(
        "UNSUPPORTED_TABLE_ALIAS",
        "A query scope cannot refer to two tables with the same physical name; semantic table aliases are not yet supported by the PostgreSQL planner",
      );
  }
  const customOrderBy = columns
    .filter((c) => c.sortDirection !== "none")
    .map((c) => ({
      alias: c.id,
      direction: c.sortDirection as "asc" | "desc",
    }));

  const defaultOrderBy = dimColumns
    .filter((c) => c.sortDirection === "none")
    .map((c) => ({ alias: c.id, direction: "asc" as const }));

  const orderBy = [...customOrderBy, ...defaultOrderBy];

  return {
    main: {
      select: columns.map((c) => {
        return {
          alias: c.id,
          relation: "results",
          attribute: c.id,
        };
      }),
      from: {
        relation: "results",
        joins: [],
      },
      where: filter,
      orderBy,
      limit: config.limit,
    },
    ctes: cteList.ctes,
  };
}

function makeDimensionsCTE(dims: CheckedColumn[], graph: Graph): CTE {
  invariant(dims.length > 0, "Must have at least one dimension column");

  const [baseField, ...restFields] = dims.flatMap((d) => extractColumns(d.expression));
  const baseFieldNode = graph.getNodeByName(baseField.graphNode);
  const column = graph.getColumnByName(baseFieldNode.id, baseField.columnName);

  const joinPath = graph.multiJoinPath(
    baseFieldNode.id,
    restFields.map((f) => graph.getNodeByName(f.graphNode).id),
  );

  return {
    alias: "dimensions",
    query: {
      select: dims.map((c) => {
        return {
          expression: c.expression,
          alias: c.id,
        };
      }),
      from: {
        schema: column.relation.schema,
        relation: column.relation.tableName,
        joins: joinPath.map((j) => {
          const left = graph.getColumnById(j.left.nodeId, j.left.columnId);
          const right = graph.getColumnById(j.right.nodeId, j.right.columnId);
          return {
            join: "inner" as const,
            targetRelation: right.relation.tableName,
            targetSchema: right.relation.schema,
            conditions: [
              {
                sourceRelation: left.relation.tableName,
                sourceAttribute: left.name,
                targetAttribute: right.name,
                joinNulls: false,
              },
            ],
          };
        }),
      },
      groupBy: numbersUpTo(dims.length),
    },
  };
}

function makeJoinCTEs(graph: Graph, dims: CheckedColumn[], measures: CheckedColumn[]): CTE[] {
  const dimNodes = dims.flatMap((d) => extractUniqueNodes(d.expression));

  return measures.flatMap((measure) => {
    return measure.aggregates.map((aggregate) => {
      const pk = graph.primaryKey(aggregate.node.id as GraphNodeID);
      const conditionNodes = aggregate.condition ? extractUniqueNodes(aggregate.condition) : [];
      const toNodes = new Set([...dimNodes, ...conditionNodes]);
      const joinPath = graph.multiJoinPath(
        aggregate.node.id as GraphNodeID,
        Array.from(toNodes).map((n) => graph.getNodeByName(n).id),
      );

      return {
        alias: `join: ${aggregate.alias}`,
        query: {
          select: [
            ...dims.map((c) => ({
              expression: c.expression,
              alias: c.id,
            })),
            ...pk.columnNames.map((columnName, index) => ({
              expression: {
                nodeType: "column",
                graphNode: pk.node.name,
                columnName: columnName,
                id: -1,
                meta: { from: 0, to: 0 },
              } as Column,
              alias: `key ${index}`,
            })),
          ] as FormulaColumn[],
          from: {
            schema: pk.node.relation.schema,
            relation: pk.node.relation.tableName,
            joins: joinPath.map((j) => {
              const left = graph.getColumnById(j.left.nodeId, j.left.columnId);
              const right = graph.getColumnById(j.right.nodeId, j.right.columnId);

              return {
                join: "inner" as const,
                targetRelation: right.relation.tableName,
                targetSchema: right.relation.schema,
                conditions: [
                  {
                    sourceRelation: left.relation.tableName,
                    sourceAttribute: left.name,
                    targetAttribute: right.name,
                    joinNulls: false,
                  },
                ],
              };
            }),
          },
          where: aggregate.condition,
          groupBy: numbersUpTo(dims.length + pk.columnNames.length),
        },
      };
    });
  });
}

function makeAggregateCTEs(graph: Graph, dims: CheckedColumn[], measures: CheckedColumn[]): CTE[] {
  return measures.flatMap((m) => {
    return m.aggregates.map((a) => {
      const pk = graph.primaryKey(a.node.id as GraphNodeID);

      return {
        alias: `aggregate: ${a.alias}`,
        query: {
          select: [
            ...dims.map((c) => {
              return {
                relation: `join: ${a.alias}`,
                attribute: c.id,
                alias: c.id,
              } as StandardColumn;
            }),
            {
              expression: a.expression,
              alias: a.alias,
            } as FormulaColumn,
          ],
          from: {
            relation: `join: ${a.alias}`,
            joins: [
              {
                join: "inner" as const,
                targetRelation: a.node.relation.tableName,
                targetSchema: a.node.relation.schema,
                conditions: pk.columnNames.map((columnName, index) => ({
                  sourceRelation: `join: ${a.alias}`,
                  sourceAttribute: `key ${index}`,
                  targetAttribute: columnName,
                  joinNulls: false,
                })),
              },
            ],
          },
          groupBy: numbersUpTo(dims.length),
        },
      };
    });
  });
}

function makeResultsCTE(
  regularDims: CheckedColumn[],
  scalarDims: CheckedColumn[],
  measures: CheckedColumn[],
  fromRelation: string,
  joinAggregates: CheckedColumn["aggregates"],
  aggregateLookup: AggregateLookup,
): CTE {
  return {
    alias: "results",
    query: {
      select: [
        // Regular dimensions reference the dimensions CTE
        ...regularDims.map((c) => {
          return {
            attribute: c.id,
            relation: "dimensions",
            alias: c.id,
          } as StandardColumn;
        }),
        // Scalar dimensions are computed directly as formula expressions
        ...scalarDims.map((c) => {
          return {
            expression: c.expression,
            alias: c.id,
          } as FormulaColumn;
        }),
        ...measures.map((c) => {
          // Transform the formula such that any aggregate function calls are
          // replaced with a reference to the correct field from the
          // corresponding aggregate CTE.
          const expression = updateExpression(c.expression, (node) => {
            if (node.nodeType !== "functionCall") {
              return node;
            }
            const func = functionLookup(node.name);
            invariant(func !== undefined, `unknown function: ${node.name.toUpperCase()}`);
            if (func.isAggregate) {
              const key = [c.id, node.id].join(":");
              const agg = aggregateLookup.get(key);
              invariant(agg !== undefined, `missing aggregate: ${key}`);
              const aggColumn = {
                nodeType: "aggColumn" as const,
                graphNode: agg.node.name,
                relationName: `aggregate: ${agg.alias}`,
                columnName: agg.alias,
                id: node.id,
                meta: node.meta,
              };

              if (func.aggregateDefault !== undefined) {
                const aggDefault = {
                  nodeType: "scalar" as const,
                  value: func.aggregateDefault,
                  id: -1,
                  meta: { from: 0, to: 0 },
                };
                return {
                  nodeType: "functionCall" as const,
                  name: "Coalesce",
                  args: [aggColumn, aggDefault],
                  id: -1,
                  meta: { from: 0, to: 0 },
                };
              }

              return aggColumn;
            }
            return node;
          });
          return {
            expression,
            alias: c.id,
          } as FormulaColumn;
        }),
      ],
      from: {
        relation: fromRelation,
        joins: joinAggregates.map((a) => {
          return {
            join: "left" as const,
            targetRelation: `aggregate: ${a.alias}`,
            // Only regular dimensions are used for join conditions
            conditions: regularDims.map((d) => {
              return {
                sourceRelation: "dimensions",
                sourceAttribute: d.id,
                targetAttribute: d.id,
                joinNulls: true,
              };
            }),
          };
        }),
      },
    },
  };
}

function makeCTEs(
  dimColumns: CheckedColumn[],
  measureColumns: CheckedColumn[],
  dataGraph: Graph,
  aggregateLookup: AggregateLookup,
) {
  const [regularDims, scalarDims] = partitionDimensions(dimColumns);
  const hasTableRefs = regularDims.length > 0 || measureColumns.length > 0;

  if (!hasTableRefs) {
    return makeScalarOnlyPlan(scalarDims);
  }

  return makeTableBackedPlan(regularDims, scalarDims, measureColumns, dataGraph, aggregateLookup);
}

/**
 * Handles the pure-scalar case: no column references anywhere, no measures.
 * Produces a single results CTE selecting scalar expressions from a single-row source.
 */
function makeScalarOnlyPlan(scalarDims: CheckedColumn[]) {
  return {
    ctes: [
      {
        alias: "results",
        query: {
          select: scalarDims.map((c) => ({
            expression: c.expression,
            alias: c.id,
          })) as FormulaColumn[],
          from: {
            relation: "_",
            joins: [],
            singleRow: true,
          },
        },
      },
    ],
  };
}

/**
 * Handles all cases where we need to touch actual tables.
 * Regular dimensions drive whether we need a dimensions CTE.
 */
function makeTableBackedPlan(
  regularDims: CheckedColumn[],
  scalarDims: CheckedColumn[],
  measureColumns: CheckedColumn[],
  dataGraph: Graph,
  aggregateLookup: AggregateLookup,
) {
  if (regularDims.length > 0) {
    return makeDimensionAnchoredPlan(
      regularDims,
      scalarDims,
      measureColumns,
      dataGraph,
      aggregateLookup,
    );
  }

  return makeMeasureAnchoredPlan(scalarDims, measureColumns, dataGraph, aggregateLookup);
}

/**
 * Regular dimensions anchor the query structure.
 * Creates dimensions CTE, join CTEs, aggregate CTEs, and results CTE.
 */
function makeDimensionAnchoredPlan(
  regularDims: CheckedColumn[],
  scalarDims: CheckedColumn[],
  measureColumns: CheckedColumn[],
  dataGraph: Graph,
  aggregateLookup: AggregateLookup,
) {
  const allAggregates = measureColumns.flatMap((m) => m.aggregates);

  return {
    ctes: [
      makeDimensionsCTE(regularDims, dataGraph),
      ...makeJoinCTEs(dataGraph, regularDims, measureColumns),
      ...makeAggregateCTEs(dataGraph, regularDims, measureColumns),
      makeResultsCTE(
        regularDims,
        scalarDims,
        measureColumns,
        "dimensions",
        allAggregates,
        aggregateLookup,
      ),
    ],
  };
}

/**
 * No regular dimensions, but we have measures.
 * Measures anchor the query via their aggregate CTEs.
 */
function makeMeasureAnchoredPlan(
  scalarDims: CheckedColumn[],
  measureColumns: CheckedColumn[],
  dataGraph: Graph,
  aggregateLookup: AggregateLookup,
) {
  const allAggregates = measureColumns.flatMap((m) => m.aggregates);
  const aggregateCTEs = makeAggregateCTEs(dataGraph, [], measureColumns);

  invariant(aggregateCTEs.length > 0, "expected at least one aggregate");

  return {
    ctes: [
      ...makeJoinCTEs(dataGraph, [], measureColumns),
      ...aggregateCTEs,
      makeResultsCTE(
        [],
        scalarDims,
        measureColumns,
        aggregateCTEs[0].alias,
        allAggregates.slice(1),
        aggregateLookup,
      ),
    ],
  };
}

function extractColumns(expression: AST) {
  const columns: Column[] = [];

  walkAST(expression, {
    enter: (node) => {
      if (node.nodeType === "column") {
        columns.push(node);
      }
    },
    leave: () => {},
  });

  return columns;
}

function extractUniqueNodes(expression: AST) {
  const columns = extractColumns(expression);
  const nodes = new Set<string>();
  for (const c of columns) {
    nodes.add(c.graphNode);
  }
  return Array.from(nodes);
}

function partitionColumns(columns: CheckedColumn[]) {
  const dimColumns: CheckedColumn[] = [];
  const measureColumns: CheckedColumn[] = [];
  for (const col of columns) {
    if (col.isMeasure) {
      measureColumns.push(col);
    } else {
      dimColumns.push(col);
    }
  }
  return [dimColumns, measureColumns] as const;
}

function partitionDimensions(dims: CheckedColumn[]) {
  const regularDims: CheckedColumn[] = [];
  const scalarDims: CheckedColumn[] = [];
  for (const dim of dims) {
    const columns = extractColumns(dim.expression);
    if (columns.length > 0) {
      regularDims.push(dim);
    } else {
      scalarDims.push(dim);
    }
  }
  return [regularDims, scalarDims] as const;
}

function numbersUpTo(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1);
}

export { buildQueryPlan };
export type { CheckedColumn, BuildQueryPlanConfig } from "./types.js";
