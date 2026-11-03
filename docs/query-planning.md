# Query planning

Consider `Studio = [Studios/name]`, `Revenue = SUM([Lines/price] * [Lines/quantity])`,
and `Orders = COUNT([Orders/id])`. Studios have many orders, and orders have many
lines. A naive join followed by `COUNT(orders.id)` counts one order per line.
Chartzap plans each measure at its own grain instead.

1. **Dimensions CTE**: joins referenced dimension nodes and groups by their values.
2. **Join CTE per aggregate**: joins the aggregate’s source to dimensions and any
   condition tables, then groups by dimensions plus the complete source primary
   key. Duplicate join rows collapse before aggregation.
3. **Aggregate CTE**: rejoins that deduplicated key set to the source and computes
   the aggregate grouped by dimensions. Conditional aggregate predicates were
   applied in its join CTE, so each measure may use different conditions.
4. **Results CTE**: left joins each aggregate back to the dimension set. Null
   dimension values match through explicit null-safe predicates. Function
   specifications determine empty-set defaults (counts coalesce to zero).
5. **Main query**: projects stable output aliases, applies a result-set filter,
   orders explicit sorts then unsorted dimensions, and applies an optional limit.

With no dimensions, aggregates anchor the results query. Pure scalar queries
use a single-row `VALUES` source. Filters such as `{Revenue} > 50` run after
aggregation; source-row predicates belong in conditional functions such as
`SUMIF([Orders/total], [Orders/fulfilled])`.

## Semantic graph constraints

The graph is a deliberate analytics model, not a lossless database-schema dump.
A pair of connected nodes has exactly one path. Adding a second path, cycle,
parallel edge, or self edge throws `GraphError` with `AMBIGUOUS_JOIN_PATH`.
Choose which database relationship represents the analytics question and model
that edge explicitly. Do not silently discard relationships from an imported
schema or assume the planner chooses the shortest route.

A graph may contain isolated nodes or disconnected components for separate
queries. Joining disconnected requested nodes fails with `DISCONNECTED_NODES`.
Measure deduplication needs source primary keys; missing keys produce
`MISSING_PRIMARY_KEY`. Single-column join edges and composite source primary keys
are supported. Composite join conditions are not yet a schema API feature.

The graph can represent two semantic roles for a physical relation, but this
planner does not yet assign SQL aliases to repeated physical names in one query
scope. Such a query produces `UNSUPPORTED_TABLE_ALIAS`. This also covers equally
named tables in different physical schemas when both are needed in one scope.

## SQL contract

Scalars are bound with explicit PostgreSQL types. SQL identifiers originate in
the trusted schema, planner-generated names, or validated output IDs. Every
embedded double quote is doubled; debugging literal SQL doubles every single
quote. User function names resolve through the fixed specification catalogue.
Date-unit syntax is checked against an allowlist rather than interpolated from
arbitrary text. Division guards a zero denominator with `NULLIF`.

No result limit is imposed by default. `limit: 0` is valid; negative, fractional,
nonfinite, and unsafe integer limits are rejected. Limits are validated integers
in SQL syntax, not arbitrary text. SQL execution and connection-level policies
remain the caller’s responsibility.

Ordering dimension values is deterministic subject to the receiving database’s
collation and ties. Schema identifiers must describe the real database. The
compiler cannot discover nullability, data quality, implicit casts, or database
permissions from a formula.
