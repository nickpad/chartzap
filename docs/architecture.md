# Architecture

The core is independent of the framework, browser editor, SQL dialect, database
driver, and application services. The playground composes all three packages;
it is not a runtime dependency of any library.

1. **Parser** — A Lezer grammar defines syntax and precedence. The generated LR
   parser is shared by the AST compiler and CodeMirror. AST IDs are local to one
   formula and assigned deterministically. Source ranges survive transformations.
2. **Functions** — Declarative specifications hold argument roles, type matching,
   metadata, aggregate defaults, and typechecking. PostgreSQL syntax is absent.
3. **Schema** — Explicitly hydrated nodes point to physical relations. Edges form
   a unique-path semantic model. Graph construction validates ambiguity before a
   query reaches the planner. No schema is globally cached.
4. **Typechecker** — Resolves columns, validates functions and operators, records
   per-node types, identifies dimension/measure roles, and associates aggregate
   expressions and conditions with a semantic node. Invalid user formulas return
   discriminated results.
5. **Planner** — Determines joins and deduplication at each aggregate’s primary-key
   grain. Builds an IR of CTEs, select expressions, joins, filters, grouping,
   ordering, and an optional result limit. Generated aggregate aliases are unique
   across output columns.
6. **Renderer** — Converts IR and AST expressions into PostgreSQL. Quoted
   identifiers are separate from bound values. Rendering does not execute SQL.
7. **Editor** — CodeMirror adds completions, semantic syntax classes, linting, and
   function focus. A separate React entry point owns editor mount and cleanup.

`createFormulaEngine` composes parsing and typechecking with a supplied compiler
adapter. This keeps the common API in core without importing the PostgreSQL
implementation. The SQL IR remains distinct from both the AST and SQL text.

## Reproducible parser

Run `pnpm generate` with the lockfile’s `@lezer/generator`. Commit the grammar and
`packages/core/src/formula/generated/{formula.js,formula.terms.js,formula.d.ts}`.
The declaration describes the generated parser’s public type. Generated JavaScript
is excluded from formatting. CI regenerates it and fails if tracked output
changes; no build-time parser generator is required by consumers.

## Determinism

A fresh graph uses local sequential IDs rather than random persistence IDs.
AST IDs restart for each formula. Output IDs are sorted with bytewise string
comparison, and aggregate aliases derive from sorted column/aggregate indexes.
Repeated compilation with the same semantic schema and query produces identical
IR and parameterized SQL. SQL values such as `Today()` are evaluated by the
receiving database and do not make compilation itself nondeterministic.
