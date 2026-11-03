import { createSchemaGraph, createFormulaEngine, Graph, GraphError } from "@chartzap/core";
import { postgres, doubleQuote, singleQuote } from "../../packages/postgres/src/index.js";
import { parseFormulaOrThrow } from "@chartzap/core";
import { atelier, exampleColumns } from "../../examples/atelier/schema.js";
import { expect, test } from "vitest";
const graph = createSchemaGraph(atelier);
const engine = createFormulaEngine({ graph });
const compile = (formula: string) =>
  engine.compileQuery({ columns: [{ name: "Value", formula }], compiler: postgres() });

test("public schema → formulas → AST → plan → parameterized PostgreSQL", () => {
  const result = engine.compileQuery({
    columns: exampleColumns,
    filter: "{Revenue} > 10",
    compiler: postgres(),
    limit: 20,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.columns[0].expression.nodeType).toBe("column");
  expect(result.plan.ctes.length).toBeGreaterThan(3);
  expect(result.sql.text).toContain('"atelier"."lines"');
  expect(result.sql.text).toContain('"atelier"."orders"');
  expect(result.sql.text).toContain("LIMIT 20");
  expect(result.sql.parameters).toContain(10);
  expect(result.plan.ctes.map((c) => c.alias).length).toBe(
    new Set(result.plan.ctes.map((c) => c.alias)).size,
  );
});

test.each([`a"b"c`, `"; DROP TABLE orders; --"`])("quotes every identifier quote: %s", (value) => {
  expect(doubleQuote(value)).toBe(`"${value.replaceAll('"', '""')}"`);
});
test.each(["it's 'quoted'", "'); DROP TABLE orders; --", "back\\slash 'x'"])(
  "quotes every string quote: %s",
  (value) => {
    expect(singleQuote(value)).toBe(`'${value.replaceAll("'", "''")}'`);
  },
);
test("NUL identifiers are rejected", () => expect(() => doubleQuote("x\0y")).toThrow());
test("hostile scalars remain parameters", () => {
  const result = compile(`CONCAT("'); DROP TABLE orders; --", "it's 'quoted'")`);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.sql.text).not.toContain("DROP TABLE");
  expect(result.sql.parameters).toEqual(["'); DROP TABLE orders; --", "it's 'quoted'"]);
});
test("all scalar types are parameterized in textual order", () => {
  const result = compile("IF(TRUE, 7 + 8, 9)");
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.sql.parameters).toEqual([true, 7, 8, 9]);
  expect(result.sql.text).toContain(
    "CASE WHEN $1::boolean THEN ($2::numeric + $3::numeric) ELSE $4::numeric END",
  );
});
test.each(["1 AND TRUE", 'FALSE OR "yes"', "TRUE AND (1 OR FALSE)"])(
  "rejects non-boolean operands: %s",
  (formula) => {
    const result = compile(formula);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.diagnostics.some(
        (d) => d.code === "TYPE_ERROR" && d.message.includes("boolean operands"),
      ),
    ).toBe(true);
  },
);
test.each([
  "TRUE AND FALSE",
  "TRUE OR (FALSE AND TRUE)",
  "[Orders/fulfilled] AND [Orders/total] > 0",
])("accepts boolean operands: %s", (formula) => expect(compile(formula).ok).toBe(true));
test.each(["ABS(1, 2)", "IF(WRONG(1), 2, 3)", "DateAdd([Studios/name], 1, TODAY())"])(
  "invalid user functions produce diagnostics: %s",
  (formula) => expect(compile(formula).ok).toBe(false),
);
test.each([undefined, 0, 100, 1001])("uses explicit/no result limit: %s", (limit) => {
  const result = engine.compileQuery({ columns: exampleColumns, compiler: postgres(), limit });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.plan.main.limit).toBe(limit);
  expect(result.sql.text.includes("LIMIT")).toBe(limit !== undefined);
});
test.each([-1, 0.5, Infinity, NaN])("rejects invalid limit: %s", (limit) =>
  expect(engine.compileQuery({ columns: exampleColumns, compiler: postgres(), limit }).ok).toBe(
    false,
  ),
);
test("filter display names resolve to explicit output IDs", () => {
  const result = engine.compileQuery({
    columns: [{ name: "Total", id: "total_id", formula: "SUM([Orders/total])" }],
    filter: "{Total} > 5",
    compiler: postgres(),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.sql.text).toContain('"total_id" >');
});
test("aggregate CTE aliases are unique across same-function measures", () => {
  const result = engine.compileQuery({
    columns: [
      { name: "A", formula: "SUM([Orders/total])" },
      { name: "B", formula: "SUM([Orders/id])" },
    ],
    compiler: postgres(),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(new Set(result.plan.ctes.map((c) => c.alias)).size).toBe(result.plan.ctes.length);
});
test("nested standard functions inside aggregates retain schema context", () =>
  expect(compile("SUM(ABS([Lines/price]))").ok).toBe(true));
test("compilation is deterministic across graph instances and column permutations", () => {
  const a = engine.compileQuery({ columns: exampleColumns, compiler: postgres() });
  const b = createFormulaEngine({ graph: createSchemaGraph(atelier) }).compileQuery({
    columns: [...exampleColumns].reverse(),
    compiler: postgres(),
  });
  expect(a.ok && b.ok).toBe(true);
  if (!a.ok || !b.ok) return;
  expect(a.plan).toEqual(b.plan);
  expect(a.sql).toEqual(b.sql);
});
test.each([
  { columns: [] },
  {
    columns: [
      { name: "A", formula: "1" },
      { name: "A", formula: "2" },
    ],
  },
])("rejects empty or duplicate outputs", ({ columns }) =>
  expect(engine.compileQuery({ columns, compiler: postgres() }).ok).toBe(false),
);
test("ambiguous paths return a stable graph domain error", () => {
  const g = createSchemaGraph(atelier);
  expect(() =>
    g.addEdge(
      {
        nodeId: g.getNodeByName("Studios").id,
        columnId: g.getNodeByName("Studios").relation.columns[0].id,
      },
      {
        nodeId: g.getNodeByName("Lines").id,
        columnId: g.getNodeByName("Lines").relation.columns[0].id,
      },
    ),
  ).toThrow(expect.objectContaining({ code: "AMBIGUOUS_JOIN_PATH" }));
});
test("self joins are rejected with the same domain error", () => {
  const g = createSchemaGraph(atelier);
  const node = g.getNodeByName("Studios");
  expect(() =>
    g.addEdge(
      { nodeId: node.id, columnId: node.relation.columns[0].id },
      { nodeId: node.id, columnId: node.relation.columns[0].id },
    ),
  ).toThrow(expect.objectContaining({ code: "AMBIGUOUS_JOIN_PATH" }));
});
test("deserialization is synchronous and validates the graph", () => {
  expect(
    Graph.fromSerialized(
      graph.serialize(),
      graph.allNodes().map((n) => graph.getNode(n.id).relation),
    ),
  ).toBeInstanceOf(Graph);
  expect(() => Graph.fromSerialized({}, [])).toThrow(GraphError);
});
test("disconnected formulas produce diagnostics instead of Cartesian SQL", () => {
  const seed = { ...atelier, graphEdges: [] };
  const result = createFormulaEngine({ graph: createSchemaGraph(seed) }).compileQuery({
    columns: exampleColumns,
    compiler: postgres(),
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.diagnostics[0].code).toBe("DISCONNECTED_NODES");
});
test("missing measure primary keys produce diagnostics", () => {
  const seed = { ...atelier, relations: atelier.relations.map((r) => ({ ...r, primaryKeys: [] })) };
  const result = createFormulaEngine({ graph: createSchemaGraph(seed) }).compileQuery({
    columns: exampleColumns,
    compiler: postgres(),
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.diagnostics[0].code).toBe("MISSING_PRIMARY_KEY");
});
test("parse diagnostics include source ranges", () => {
  const result = compile("SUM(");
  expect(result.ok).toBe(false);
  if (!result.ok)
    expect(result.diagnostics[0]).toMatchObject({ code: "PARSE_ERROR", from: 0, to: 4 });
});
test("date arithmetic binds amounts outside SQL interval literals", () => {
  const result = compile('DATEADD("day", 2, TODAY())');
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.sql.text).toContain("($1::numeric) * INTERVAL '1 day'");
  expect(result.sql.parameters).toEqual([2]);
});
test.each(["SUM(1)", "SUM([Orders/total]) + SUM(1)", "SUM([Orders/total]) + [Orders/total]"])(
  "rejects unsupported aggregate context: %s",
  (formula) => expect(compile(formula).ok).toBe(false),
);
test("decodes multiple escaped quotes in text literals", () => {
  expect(parseFormulaOrThrow('"a\\"b\\"c"')).toMatchObject({ nodeType: "scalar", value: 'a"b"c' });
});
test("decodes escaped schema delimiters in column references", () => {
  expect(parseFormulaOrThrow("[A\\/B/co\\]l]")).toMatchObject({
    nodeType: "column",
    graphNode: "A/B",
    columnName: "co]l",
  });
});
test("IDs are independent of long display names and respect PostgreSQL identifier lengths", () => {
  expect(
    engine.compileQuery({ columns: [{ name: "x".repeat(80), formula: "1" }], compiler: postgres() })
      .ok,
  ).toBe(false);
  expect(
    engine.compileQuery({
      columns: [{ id: "short", name: "x".repeat(80), formula: "1" }],
      compiler: postgres(),
    }).ok,
  ).toBe(true);
});
test("deserialized graphs can be extended without ID collisions", () => {
  const restored = Graph.fromSerialized(
    graph.serialize(),
    graph.allNodes().map((n) => graph.getNode(n.id).relation),
  );
  const id = restored.addNode("Other", { ...graph.getNodeByName("Studios").relation, id: 100 });
  expect(restored.getNode(id).name).toBe("Other");
  expect(restored.allNodes().length).toBe(4);
});

test("generated key and aggregate aliases avoid user output IDs", () => {
  const result = engine.compileQuery({
    columns: [
      { id: "key 0", name: "Studio", formula: "[Studios/name]" },
      { id: "a0_0", name: "Count", formula: "COUNT([Orders/id])" },
    ],
    compiler: postgres(),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  for (const cte of result.plan.ctes) {
    const aliases = cte.query.select.map((c) => c.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
  }
});
