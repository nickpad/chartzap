import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createSchemaGraph, createFormulaEngine } from "@chartzap/core";
import { postgres } from "../../packages/postgres/src/index.js";
import { atelier, exampleColumns } from "../../examples/atelier/schema.js";
const connectionString = process.env.TEST_DATABASE_URL;
const client = new pg.Client({ connectionString });
const engine = createFormulaEngine({ graph: createSchemaGraph(atelier) });
beforeAll(async () => {
  await client.connect();
  await client.query(
    await readFile(new URL("../../examples/atelier/data.sql", import.meta.url), "utf8"),
  );
});
afterAll(async () => {
  await client.end();
});
async function query(columns: { name: string; formula: string }[], filter?: string) {
  const result = engine.compileQuery({ columns, filter, compiler: postgres() });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return (await client.query(result.sql.text, result.sql.parameters)).rows;
}
test("joins dimensions and measures without multiplying parent aggregates", async () => {
  const rows = await query(exampleColumns);
  expect(
    rows.map((r) => ({ Studio: r.Studio, Revenue: Number(r.Revenue), Orders: Number(r.Orders) })),
  ).toEqual([
    { Studio: "East", Revenue: 70, Orders: 2 },
    { Studio: "West", Revenue: 40, Orders: 1 },
  ]);
});
test("filters grouped results", async () =>
  expect((await query(exampleColumns, "{Revenue} > 50")).map((r) => r.Studio)).toEqual(["East"]));
test("uses distinct CTE aliases for two sums from the same table", async () => {
  const [row] = await query([
    { name: "Total", formula: "SUM([Orders/total])" },
    { name: "IDs", formula: "SUM([Orders/id])" },
  ]);
  expect(Number(row.Total)).toBe(110);
  expect(Number(row.IDs)).toBe(6);
});
test("conditional aggregation supports a related-table filter", async () => {
  const [row] = await query([
    { name: "Total", formula: 'SUMIF([Orders/total], [Studios/name] = "East")' },
  ]);
  expect(Number(row.Total)).toBe(70);
});
test.each([
  { formula: 'CONCAT("hello", " world")', expected: "hello world" },
  { formula: "IF(TRUE, 7 + 8, 9)", expected: 15 },
  { formula: 'CONTAINS("Hello", "ell")', expected: true },
  { formula: "NOT(FALSE)", expected: true },
  { formula: "TRUNC(2.375, 2)", expected: 2.37 },
  { formula: 'YEAR(DATEADD("day", 2, MAKEDATE(2024, 1, 1)))', expected: 2024 },
])("executes scalar formula $formula", async ({ formula, expected }) => {
  const [row] = await query([{ name: "Value", formula }]);
  expect(typeof expected === "number" ? Number(row.Value) : row.Value).toBe(expected);
});
test("hostile text is returned as data", async () => {
  const [row] = await query([{ name: "Value", formula: '"\'); DROP TABLE atelier.orders; --"' }]);
  expect(row.Value).toBe("'); DROP TABLE atelier.orders; --");
  expect((await client.query("SELECT count(*) FROM atelier.orders")).rows[0].count).toBe("3");
});

test("executes hostile multi-quote identifiers without changing SQL structure", async () => {
  await client.query(
    `CREATE TABLE IF NOT EXISTS atelier."odd""table""name" ("co""l""umn" text); TRUNCATE atelier."odd""table""name"; INSERT INTO atelier."odd""table""name" VALUES ('O''Brien ''x''');`,
  );
  const graph = createSchemaGraph({
    relations: [
      {
        schema: "atelier",
        name: 'odd"table"name',
        primaryKeys: [],
        columns: [{ name: 'co"l"umn', type: "text" }],
      },
    ],
    graphNodes: [{ name: "Odd", relation: 'atelier.odd"table"name' }],
    graphEdges: [],
  });
  const name = 'R"; DROP SCHEMA atelier;--';
  const result = createFormulaEngine({ graph }).compileQuery({
    columns: [{ name, formula: '[Odd/co"l"umn]' }],
    compiler: postgres(),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const rows = (await client.query(result.sql.text, result.sql.parameters)).rows;
  expect(rows[0][name]).toBe("O'Brien 'x'");
  expect((await client.query("SELECT count(*) FROM atelier.orders")).rows[0].count).toBe("3");
});

test("output IDs may match internal alias candidates", async () => {
  const result = engine.compileQuery({
    columns: [
      { id: "key 0", name: "Studio", formula: "[Studios/name]" },
      { id: "a0_0", name: "Count", formula: "COUNT([Orders/id])" },
    ],
    compiler: postgres(),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const rows = (await client.query(result.sql.text, result.sql.parameters)).rows;
  expect(rows.map((r) => ({ Studio: r["key 0"], Count: Number(r.a0_0) }))).toEqual([
    { Studio: "East", Count: 2 },
    { Studio: "West", Count: 1 },
  ]);
});
