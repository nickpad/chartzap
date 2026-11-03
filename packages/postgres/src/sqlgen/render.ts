import type { Graph } from "@chartzap/core/schema/graph";

import type {
  CTE,
  CTEQuery,
  FinalQuery,
  FormulaColumn,
  From,
  MainQuery,
  StandardColumn,
} from "../queryplan/types.js";
import { isFormulaColumn } from "../queryplan/types.js";
import { doubleQuote, sqlExpression } from "./sql-expression.js";
import { SQLText } from "./sql-text.js";

interface RenderContext {
  graph: Graph;
  parameters?: (string | number | boolean)[];
}

function renderSQL(
  query: FinalQuery,
  graph: Graph,
  parameters?: (string | number | boolean)[],
): string {
  if (
    query.main.limit !== undefined &&
    (!Number.isSafeInteger(query.main.limit) || query.main.limit < 0)
  )
    throw new RangeError("Invalid query limit");
  const context: RenderContext = { graph, parameters };
  const t = new SQLText();

  if (query.ctes.length > 0) {
    t.addLine("WITH");
    t.indent(() => {
      t.listOf(query.ctes, (cte) => {
        renderCTE(t, cte, context);
      });
    });
    t.newLine();
  }

  renderMainQuery(t, query.main, context);

  return t.toString();
}

function renderCTE(t: SQLText, cte: CTE, context: RenderContext): void {
  t.addLine(`${doubleQuote(cte.alias)} AS (`);
  t.indent(() => {
    renderQuery(t, cte.query, context);
  });
  t.addLine(")");
}

function renderQuery(t: SQLText, query: CTEQuery | MainQuery, context: RenderContext): void {
  // SELECT
  t.addLine("SELECT");
  t.indent(() => {
    t.listOf(query.select, (c) => {
      renderColumn(t, c, context);
    });
  });

  // FROM
  t.addLine("FROM");
  t.indent(() => {
    t.addLine(renderFromRef(query.from));
  });

  // JOINS
  if (query.from.joins.length > 0) {
    for (const j of query.from.joins) {
      t.addLine(`${j.join.toUpperCase()} JOIN`);
      t.indent(() => {
        if (j.conditions.length > 0) {
          t.addLine(
            [j.targetSchema, j.targetRelation]
              .filter((x): x is string => x !== undefined)
              .map(doubleQuote)
              .join("."),
            "ON",
          );
          j.conditions.forEach((c, index) => {
            const source = renderColumnReference(c.sourceRelation, c.sourceAttribute);
            const target = renderColumnReference(j.targetRelation, c.targetAttribute);
            if (c.joinNulls) {
              t.addLine("(");
              t.indent(() => {
                t.addLine(`(${target} = ${source}) OR`);
                t.addLine(`(${target} IS NULL AND ${source} IS NULL)`);
              });
              t.addLine(")", index < j.conditions.length - 1 ? "AND" : "");
            } else {
              t.addLine(`${target} = ${source}`, index < j.conditions.length - 1 ? "AND" : "");
            }
          });
        } else {
          t.addLine(doubleQuote(j.targetRelation), "ON 1 = 1");
        }
      });
    }
  }

  // WHERE
  if (query.where) {
    t.addLine("WHERE");
    t.indent(() => {
      const sqlText = sqlExpression(query.where!, {
        graph: context.graph,
        parameters: context.parameters,
      });
      t.addLine(sqlText);
    });
  }

  // GROUP BY
  if (query.groupBy && query.groupBy.length > 0) {
    t.addLine("GROUP BY", query.groupBy.join(", "));
  }
}

function renderMainQuery(t: SQLText, query: MainQuery, context: RenderContext): void {
  // SELECT
  t.addLine("SELECT");
  t.indent(() => {
    t.listOf(query.select, (c) => {
      renderColumn(t, c, context);
    });
  });

  // FROM
  t.addLine("FROM");
  t.indent(() => {
    t.addLine(renderFromRef(query.from));
  });

  // JOINS (for main query, typically none but support anyway)
  if (query.from.joins.length > 0) {
    for (const j of query.from.joins) {
      t.addLine(`${j.join.toUpperCase()} JOIN`);
      t.indent(() => {
        if (j.conditions.length > 0) {
          t.addLine(
            [j.targetSchema, j.targetRelation]
              .filter((x): x is string => x !== undefined)
              .map(doubleQuote)
              .join("."),
            "ON",
          );
          j.conditions.forEach((c, index) => {
            const source = renderColumnReference(c.sourceRelation, c.sourceAttribute);
            const target = renderColumnReference(j.targetRelation, c.targetAttribute);
            if (c.joinNulls) {
              t.addLine("(");
              t.indent(() => {
                t.addLine(`(${target} = ${source}) OR`);
                t.addLine(`(${target} IS NULL AND ${source} IS NULL)`);
              });
              t.addLine(")", index < j.conditions.length - 1 ? "AND" : "");
            } else {
              t.addLine(`${target} = ${source}`, index < j.conditions.length - 1 ? "AND" : "");
            }
          });
        } else {
          t.addLine(doubleQuote(j.targetRelation), "ON 1 = 1");
        }
      });
    }
  }

  // WHERE
  if (query.where) {
    t.addLine("WHERE");
    t.indent(() => {
      const sqlText = sqlExpression(query.where!, {
        graph: context.graph,
        parameters: context.parameters,
      });
      t.addLine(sqlText);
    });
  }

  // ORDER BY
  if (query.orderBy && query.orderBy.length > 0) {
    const orderBy = query.orderBy;
    t.addLine("ORDER BY");
    t.indent(() => {
      t.listOf(orderBy, (o) => {
        t.addLine(doubleQuote(o.alias), o.direction.toUpperCase());
      });
    });
  }

  // LIMIT
  if (query.limit !== undefined) {
    t.addLine("LIMIT", String(query.limit));
  }
}

function renderColumn(
  t: SQLText,
  column: FormulaColumn | StandardColumn,
  context: RenderContext,
): void {
  if (isFormulaColumn(column)) {
    const sqlText = sqlExpression(column.expression, {
      graph: context.graph,
      parameters: context.parameters,
    });
    t.addLine(sqlText, "AS", doubleQuote(column.alias));
  } else {
    t.addLine(
      renderColumnReference(column.relation, column.attribute),
      "AS",
      doubleQuote(column.alias),
    );
  }
}

function renderColumnReference(tableName: string, columnName: string): string {
  return [tableName, columnName].map(doubleQuote).join(".");
}

function renderFromRef(from: From): string {
  if (from.singleRow) {
    return `(VALUES (1)) AS ${doubleQuote(from.relation)}`;
  }
  if (from.schema) {
    return `${doubleQuote(from.schema)}.${doubleQuote(from.relation)}`;
  }
  return doubleQuote(from.relation);
}

function renderPostgres(query: FinalQuery, graph: Graph) {
  const parameters: (string | number | boolean)[] = [];
  const text = renderSQL(query, graph, parameters);
  return { text, parameters };
}
export { renderSQL, renderPostgres };
