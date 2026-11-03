import { parseFormulaOrThrow } from "@chartzap/core/formula/compile";
import { buildQueryPlan } from "../../packages/postgres/src/queryplan/index.js";
import { isFormulaColumn, isStandardColumn } from "../../packages/postgres/src/queryplan/types.js";
import type { Graph } from "@chartzap/core/schema/graph";
import { hydrateGraphFromSeed } from "@chartzap/core/schema/seed";
import { northwind } from "../fixtures/northwind.js";
import { beforeEach, describe, expect, test } from "vitest";

import { buildCheckedColumns } from "./test-utils.js";

let graph: Graph;

beforeEach(() => {
  graph = hydrateGraphFromSeed(northwind);
});

describe("buildQueryPlan", () => {
  test("empty columns returns empty plan", () => {
    const plan = buildQueryPlan({ columns: [], graph });

    expect(plan.ctes).toEqual([]);
    expect(plan.main.select).toEqual([]);
  });

  test("single dimension column", () => {
    const columns = buildCheckedColumns(
      [{ name: "Product name", formula: "[Products/product_name]" }],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    // Should have 2 CTEs: dimensions and results
    expect(plan.ctes).toHaveLength(2);
    expect(plan.ctes.map((c) => c.alias)).toEqual(["dimensions", "results"]);

    // Dimensions CTE
    const dimCTE = plan.ctes[0];
    expect(dimCTE.query.select).toHaveLength(1);
    expect(dimCTE.query.from.relation).toBe("products");
    expect(dimCTE.query.groupBy).toEqual([1]);

    // Results CTE selects from dimensions
    const resultsCTE = plan.ctes[1];
    expect(resultsCTE.query.from.relation).toBe("dimensions");
    expect(resultsCTE.query.from.joins).toHaveLength(0);

    // Main query selects from results
    expect(plan.main.from.relation).toBe("results");
    expect(plan.main.select).toHaveLength(1);
    expect(plan.main.orderBy).toEqual([{ alias: "Product name", direction: "asc" }]);
  });

  test("two dimension columns from different tables", () => {
    const columns = buildCheckedColumns(
      [
        { name: "Category", formula: "[Categories/category_name]" },
        { name: "Product", formula: "[Products/product_name]" },
      ],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    expect(plan.ctes).toHaveLength(2);

    // Dimensions CTE should have a join
    const dimCTE = plan.ctes[0];
    expect(dimCTE.query.select).toHaveLength(2);
    expect(dimCTE.query.from.joins.length).toBeGreaterThan(0);
    expect(dimCTE.query.groupBy).toEqual([1, 2]);

    // Default ordering is ascending for dimensions
    expect(plan.main.orderBy).toEqual([
      { alias: "Category", direction: "asc" },
      { alias: "Product", direction: "asc" },
    ]);
  });

  test("single measure column (no dimensions)", () => {
    const columns = buildCheckedColumns(
      [{ name: "Product count", formula: "Count([Products/product_id])" }],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    // No dimensions CTE, structure is: join, aggregate, results
    expect(plan.ctes.length).toBeGreaterThanOrEqual(2);

    const cteAliases = plan.ctes.map((c) => c.alias);
    expect(cteAliases.some((a) => a.startsWith("join:"))).toBe(true);
    expect(cteAliases.some((a) => a.startsWith("aggregate:"))).toBe(true);
    expect(cteAliases).toContain("results");

    // No dimensions CTE
    expect(cteAliases).not.toContain("dimensions");

    // Results CTE should have the measure
    const resultsCTE = plan.ctes.find((c) => c.alias === "results")!;
    expect(resultsCTE.query.select).toHaveLength(1);

    // Main query has no orderBy for measures-only
    expect(plan.main.orderBy).toEqual([]);
  });

  test("one dimension + one measure", () => {
    const columns = buildCheckedColumns(
      [
        { name: "Category", formula: "[Categories/category_name]" },
        { name: "Product count", formula: "Count([Products/product_id])" },
      ],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    // Should have 4 CTEs: dimensions, join, aggregate, results
    expect(plan.ctes).toHaveLength(4);
    const aliases = plan.ctes.map((c) => c.alias);
    expect(aliases[0]).toBe("dimensions");
    expect(aliases[1]).toMatch(/^join:/);
    expect(aliases[2]).toMatch(/^aggregate:/);
    expect(aliases[3]).toBe("results");

    // Dimensions CTE
    const dimCTE = plan.ctes[0];
    expect(dimCTE.query.select).toHaveLength(1);

    // Join CTE includes dimension columns + primary key columns
    const joinCTE = plan.ctes[1];
    expect(joinCTE.query.select.length).toBeGreaterThan(1);
    // Should have a key column for the PK
    const keyColumns = joinCTE.query.select.filter((s) => {
      if (isFormulaColumn(s)) {
        return s.alias.startsWith("key ");
      }
      return false;
    });
    expect(keyColumns.length).toBeGreaterThan(0);

    // Aggregate CTE references join CTE
    const aggCTE = plan.ctes[2];
    expect(aggCTE.query.from.relation).toMatch(/^join:/);

    // Results CTE has LEFT JOINs to aggregate CTEs
    const resultsCTE = plan.ctes[3];
    expect(resultsCTE.query.from.relation).toBe("dimensions");
    expect(resultsCTE.query.from.joins).toHaveLength(1);
    expect(resultsCTE.query.from.joins[0].join).toBe("left");
    expect(resultsCTE.query.from.joins[0].conditions[0].joinNulls).toBe(true);

    // Main query orders by dimension
    expect(plan.main.orderBy).toEqual([{ alias: "Category", direction: "asc" }]);
  });

  test("one dimension + two measures from different tables", () => {
    const columns = buildCheckedColumns(
      [
        { name: "Category", formula: "[Categories/category_name]" },
        { name: "Product count", formula: "Count([Products/product_id])" },
        { name: "Supplier count", formula: "Count([Suppliers/supplier_id])" },
      ],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    // Should have: dimensions, 2x join, 2x aggregate, results = 6 CTEs
    expect(plan.ctes).toHaveLength(6);

    const aliases = plan.ctes.map((c) => c.alias);
    expect(aliases.filter((a) => a.startsWith("join:")).length).toBe(2);
    expect(aliases.filter((a) => a.startsWith("aggregate:")).length).toBe(2);

    // Results CTE should LEFT JOIN both aggregates
    const resultsCTE = plan.ctes.find((c) => c.alias === "results")!;
    expect(resultsCTE.query.from.joins).toHaveLength(2);
    expect(resultsCTE.query.from.joins.every((j) => j.join === "left")).toBe(true);
  });

  test("measure with conditional aggregate (CountIf)", () => {
    const columns = buildCheckedColumns(
      [
        { name: "Category", formula: "[Categories/category_name]" },
        {
          name: "Tokyo products",
          formula: `CountIf([Products/product_id], Contains([Suppliers/company_name], "tokyo"))`,
        },
      ],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    // Join CTE should have a WHERE clause for the condition
    const joinCTE = plan.ctes.find((c) => c.alias.startsWith("join:"))!;
    expect(joinCTE.query.where).toBeDefined();
    expect(joinCTE.query.where?.nodeType).toBe("functionCall");
  });

  test("composite primary key handling", () => {
    // Order Details has composite PK: (order_id, product_id)
    const columns = buildCheckedColumns(
      [
        { name: "Category", formula: "[Categories/category_name]" },
        { name: "Quantity", formula: "Sum([Order Details/quantity])" },
      ],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    // Join CTE should have multiple key columns for composite PK
    const joinCTE = plan.ctes.find((c) => c.alias.startsWith("join:"))!;
    const keyColumns = joinCTE.query.select.filter((s) => {
      if (isFormulaColumn(s)) {
        return s.alias.startsWith("key ");
      }
      return false;
    });
    expect(keyColumns.length).toBe(2); // order_id and product_id

    // Aggregate CTE join conditions should match both keys
    const aggCTE = plan.ctes.find((c) => c.alias.startsWith("aggregate:"))!;
    expect(aggCTE.query.from.joins[0].conditions.length).toBe(2);
  });

  test("filter appears in main query WHERE", () => {
    const columns = buildCheckedColumns(
      [{ name: "Product name", formula: "[Products/product_name]" }],
      graph,
    );

    const filterAST = parseFormulaOrThrow('{Product name} = "Chai"');
    const plan = buildQueryPlan({ columns, filter: filterAST, graph });

    // Main query should have WHERE clause
    expect(plan.main.where).toBeDefined();
    expect(plan.main.where?.nodeType).toBe("binaryExpression");
  });

  test("custom sort direction ordering", () => {
    const columns = buildCheckedColumns(
      [
        { name: "Category", formula: "[Categories/category_name]" },
        {
          name: "Product count",
          formula: "Count([Products/product_id])",
          sortDirection: "desc",
        },
      ],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    // Custom sort comes first, then default dimension sort
    expect(plan.main.orderBy).toEqual([
      { alias: "Product count", direction: "desc" },
      { alias: "Category", direction: "asc" },
    ]);
  });

  test("measure formula with aggregate transformation creates aggColumn refs", () => {
    const columns = buildCheckedColumns(
      [
        { name: "Category", formula: "[Categories/category_name]" },
        {
          name: "Ratio",
          formula: "Count([Products/product_id]) / Count([Suppliers/supplier_id])",
        },
      ],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    // Results CTE measure column should have transformed expression
    const resultsCTE = plan.ctes.find((c) => c.alias === "results")!;
    const measureCol = resultsCTE.query.select.find((s) => {
      if (isFormulaColumn(s)) {
        return s.alias === "Ratio";
      }
      return false;
    });

    expect(measureCol).toBeDefined();
    if (isFormulaColumn(measureCol!)) {
      // The expression should be a binary expression with aggColumn or Coalesce refs
      expect(measureCol.expression.nodeType).toBe("binaryExpression");
    }
  });

  test("results CTE dimensions use StandardColumn refs", () => {
    const columns = buildCheckedColumns(
      [
        { name: "Category", formula: "[Categories/category_name]" },
        { name: "Product count", formula: "Count([Products/product_id])" },
      ],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    const resultsCTE = plan.ctes.find((c) => c.alias === "results")!;

    // First column (dimension) should be a StandardColumn
    const dimCol = resultsCTE.query.select[0];
    expect(isStandardColumn(dimCol)).toBe(true);
    if (isStandardColumn(dimCol)) {
      expect(dimCol.relation).toBe("dimensions");
      expect(dimCol.attribute).toBe("Category");
    }
  });

  test("scalar dimension with measure (no column references in dimension)", () => {
    const columns = buildCheckedColumns(
      [
        { name: "Always True", formula: "TRUE" },
        { name: "Product count", formula: "Count([Products/product_id])" },
      ],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    // No dimensions CTE since there are no regular dimensions
    const cteAliases = plan.ctes.map((c) => c.alias);
    expect(cteAliases).not.toContain("dimensions");

    // Should still have join, aggregate, and results
    expect(cteAliases.some((a) => a.startsWith("join:"))).toBe(true);
    expect(cteAliases.some((a) => a.startsWith("aggregate:"))).toBe(true);
    expect(cteAliases).toContain("results");

    // Results CTE should have the scalar dimension as a FormulaColumn
    const resultsCTE = plan.ctes.find((c) => c.alias === "results")!;
    const scalarDimCol = resultsCTE.query.select.find((s) => {
      if (isFormulaColumn(s)) {
        return s.alias === "Always True";
      }
      return false;
    });
    expect(scalarDimCol).toBeDefined();
    expect(isFormulaColumn(scalarDimCol!)).toBe(true);
    if (isFormulaColumn(scalarDimCol!)) {
      expect(scalarDimCol.expression.nodeType).toBe("scalar");
    }
  });

  test("scalar-only dimensions (no column references, no measures)", () => {
    const columns = buildCheckedColumns(
      [
        { name: "Always True", formula: "TRUE" },
        { name: "Greeting", formula: '"hello"' },
      ],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    // Should have only results CTE
    expect(plan.ctes).toHaveLength(1);
    expect(plan.ctes[0].alias).toBe("results");

    // Results CTE should use singleRow
    expect(plan.ctes[0].query.from.singleRow).toBe(true);
    expect(plan.ctes[0].query.from.relation).toBe("_");

    // Should have both scalar dimensions as FormulaColumns
    const resultsCTE = plan.ctes[0];
    expect(resultsCTE.query.select).toHaveLength(2);
    expect(isFormulaColumn(resultsCTE.query.select[0])).toBe(true);
    expect(isFormulaColumn(resultsCTE.query.select[1])).toBe(true);

    if (isFormulaColumn(resultsCTE.query.select[0])) {
      expect(resultsCTE.query.select[0].alias).toBe("Always True");
    }
    if (isFormulaColumn(resultsCTE.query.select[1])) {
      expect(resultsCTE.query.select[1].alias).toBe("Greeting");
    }
  });

  test("mixed regular and scalar dimensions with measure", () => {
    const columns = buildCheckedColumns(
      [
        { name: "Category", formula: "[Categories/category_name]" },
        { name: "Constant", formula: '"hello"' },
        { name: "Product count", formula: "Count([Products/product_id])" },
      ],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    // Should have dimensions CTE for regular dimension
    const cteAliases = plan.ctes.map((c) => c.alias);
    expect(cteAliases).toContain("dimensions");

    // Dimensions CTE should only have the regular dimension
    const dimCTE = plan.ctes.find((c) => c.alias === "dimensions")!;
    expect(dimCTE.query.select).toHaveLength(1);
    expect(isFormulaColumn(dimCTE.query.select[0])).toBe(true);
    if (isFormulaColumn(dimCTE.query.select[0])) {
      expect(dimCTE.query.select[0].alias).toBe("Category");
    }

    // Results CTE should have both dimensions
    const resultsCTE = plan.ctes.find((c) => c.alias === "results")!;

    // Regular dimension should be a StandardColumn
    const regularDimCol = resultsCTE.query.select.find((s) => {
      if (isStandardColumn(s)) {
        return s.alias === "Category";
      }
      return false;
    });
    expect(regularDimCol).toBeDefined();
    expect(isStandardColumn(regularDimCol!)).toBe(true);

    // Scalar dimension should be a FormulaColumn
    const scalarDimCol = resultsCTE.query.select.find((s) => {
      if (isFormulaColumn(s)) {
        return s.alias === "Constant";
      }
      return false;
    });
    expect(scalarDimCol).toBeDefined();
    expect(isFormulaColumn(scalarDimCol!)).toBe(true);
  });

  test("main query has no implicit limit", () => {
    const columns = buildCheckedColumns(
      [{ name: "Product name", formula: "[Products/product_name]" }],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph });

    expect(plan.main.limit).toBeUndefined();
  });
});
