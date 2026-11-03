# Public API

## Schema

`createSchemaGraph(seed)` (also `hydrateGraphFromSeed`) returns a new `Graph` each
time. A `SchemaSeed` contains:

- `relations`: physical `schema`, `name`, `primaryKeys`, and typed `columns`;
- `graphNodes`: a display `name` and qualified `relation` reference;
- `graphEdges`: `fromNodeName`, `fromColumn`, `toNodeName`, and `toColumn`.

Relation names must identify a listed relation. Node names are case-sensitive.
Edges are single-column equality joins. Multiple-column primary keys are
supported for measure deduplication; composite foreign-key edges are not.
Schemas are trusted application configuration, never user-provided SQL.

`Graph.newEmpty()` supports incremental construction with `addNode()` and
`addEdge()`. IDs default to a local deterministic sequence; a custom ID generator
can be supplied. `Graph.fromSerialized(object, relations)` validates and restores
a graph synchronously. `serialize()` serializes nodes/edges separately from
physical relation metadata.

Invalid graph configuration throws `GraphError` with a stable `code`:
`INVALID_GRAPH`, `DUPLICATE_NODE`, `AMBIGUOUS_JOIN_PATH`, `COLUMN_NOT_FOUND`,
`NODE_NOT_FOUND`, `EDGE_NOT_FOUND`, `MISSING_PRIMARY_KEY`, or `DISCONNECTED_NODES`.
The PostgreSQL planner can also report `UNSUPPORTED_TABLE_ALIAS`.

`joinPath(a, b)` returns an empty path when disconnected or identical;
`multiJoinPath(a, targets)` rejects disconnected targets and deduplicates edges.
`validate()` is a legacy connectivity check: linked nodes must form one component,
with isolated nodes permitted. A forest may still be used for separate queries;
query planning requires each requested join to be connected.

## Formulas

`compileAST(text)` returns `{ isValid: true, ast }` or `{ isValid: false }`.
`parseFormulaOrThrow(text)` is a convenience for trusted fixtures.
`walkAST()` traverses the AST, and `updateExpression()` returns a transformed AST.
Node source ranges are UTF-16 offsets `[from, to)`, as used by CodeMirror.

`createFormulaEngine({ graph })` exposes `checkColumn(text)`,
`checkFilter(text, resultSetColumns)`, and `compileQuery(input)`.
The low-level typechecker uses `status: "ok" | "parse-error" | "typecheck-failed"`.
Success exposes `ast`, `columnType`, `types` by AST ID, `isMeasure`, and aggregate
`queryData`. `formulaDiagnostics(result, text)` adapts it to public diagnostics.
Parse failures currently span the entire submitted formula; type errors carry
more specific node spans. No byte-offset conversion is performed.

## Queries

```ts
engine.compileQuery({
  columns: [{ id: "revenue", name: "Revenue", formula: "SUM([Orders/total])" }],
  filter: "{Revenue} > 100", // Optional; names refer to output display names
  limit: 50, // Optional; omitted means no LIMIT, 0 is valid
  compiler: postgres(),
});
```

Column `id` defaults to `name`. IDs and names must be unique and nonempty.
IDs are SQL aliases; they must fit 63 UTF-8 bytes and cannot contain NUL. Supply
short explicit IDs when using long display names. Filter references resolve
names to IDs before planning. Column output order is deterministic by ID,
independent of the input array’s order. Retain the original array for UI order.

Success: `{ ok: true, columns, filter, plan, sql: { text, parameters }, diagnostics: [] }`.
Each checked column exposes its `expression` AST and aggregate metadata.
Failure: `{ ok: false, diagnostics }` with `code`, `message`, `from`, `to`, and
optional `column`. Query/graph failures without a formula location use `[0, 0)`.
Input failures return results; broken invariants and misconfigured programmer
APIs may throw. The API is TypeScript-first; validate untrusted JSON at your own
application boundary.

`QueryCompiler<Plan>` is the facade’s adapter contract. The core package does not
import PostgreSQL. `postgres()` builds the plan and renders it. This separation
permits consumers to inspect or replace a backend without a core dependency
cycle; it does not imply support for other SQL dialects.

## PostgreSQL

`buildQueryPlan({ graph, columns, filter?, limit? })` consumes checked columns.
`FinalQuery`, `CTE`, `From`, `Join`, and AST types are exported for inspection.
Low-level planner inputs must already be typechecked and have unique IDs.
The empty low-level plan is inspectable but is not executable SQL; the facade
rejects an empty query.

`renderPostgres(plan, graph)` returns `{ text, parameters }`. Numbers bind as
`numeric`, strings as `text`, and booleans as `boolean`; numeric database results
may be returned as strings by your PostgreSQL driver. Pass parameters separately
to your driver. `renderSQL(plan, graph)` and `sqlExpression(ast, { graph })`
produce literal SQL for inspection and snapshots, assuming PostgreSQL’s default
`standard_conforming_strings = on`.

## Functions and editor

`functions`, `funcDefs`, `functionLookup()`, `buildFuncDisplayMap()`, `Spec`, and
`makeTypeCheck()` expose declarative metadata and reusable specification-based
validation. PostgreSQL writers live in the PostgreSQL package. The built-in
compiler’s catalogue is currently fixed; additional runtime function registration
and SQL-writer plugins are not part of this release.

The [editor guide](editor.md) covers framework-neutral setup and the optional
React wrapper. `@chartzap/core` subpath exports retain direct access to formula,
function, schema, and typechecker modules; PostgreSQL also exports its planner
and renderer subpaths. Public exports are checked in a fresh tarball consumer.
