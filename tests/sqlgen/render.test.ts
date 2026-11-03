import { buildQueryPlan } from "../../packages/postgres/src/queryplan/index.js";
import type { Graph } from "@chartzap/core/schema/graph";
import { hydrateGraphFromSeed } from "@chartzap/core/schema/seed";
import { northwind } from "../fixtures/northwind.js";
import { renderSQL } from "../../packages/postgres/src/sqlgen/index.js";
import { beforeEach, describe, expect, test } from "vitest";

import { buildCheckedColumns } from "../queryplan/test-utils.js";

let graph: Graph;

beforeEach(() => {
  graph = hydrateGraphFromSeed(northwind);
});

describe("renderSQL", () => {
  test("renders LIMIT clause", () => {
    const columns = buildCheckedColumns(
      [{ name: "Product name", formula: "[Products/product_name]" }],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph, limit: 25 });
    const sql = renderSQL(plan, graph);

    expect(sql).toContain("LIMIT 25");
  });

  test("LIMIT appears after ORDER BY", () => {
    const columns = buildCheckedColumns(
      [{ name: "Product name", formula: "[Products/product_name]" }],
      graph,
    );

    const plan = buildQueryPlan({ columns, graph, limit: 25 });
    const sql = renderSQL(plan, graph);

    const orderByIndex = sql.indexOf("ORDER BY");
    const limitIndex = sql.indexOf("LIMIT");

    expect(orderByIndex).toBeGreaterThan(-1);
    expect(limitIndex).toBeGreaterThan(orderByIndex);
    expect(orderByIndex).toBeGreaterThan(-1);
  });
});
