# Changelog

## Unreleased — 0.1.0 candidate

- Extract the analytical formula engine and CodeMirror integration from a SaaS
  BI product into three independently consumable ESM workspace packages.
- Add an explicit schema and formula-to-plan/PostgreSQL API with structured
  diagnostics and no hidden services or global schema cache.
- Bind scalar values with explicit PostgreSQL types, correct all-occurrence
  identifier/literal quoting, validate boolean operands, and make limits optional.
- Validate the unique-join-path model with graph error codes; reject disconnected
  joins, self edges, and unsupported repeated physical-table scopes.
- Give aggregate CTEs unique deterministic aliases and preserve nested function
  context inside aggregate arguments.
- Add a browser-only formula lab, original Atelier schema/data, standalone editor
  integration, tarball consumer checks, and PostgreSQL execution tests.
- Retain all 264 original relevant unit tests. Their intentional adaptations are
  package-relative imports, `id` instead of persistence vocabulary, synchronous
  deserialization, and explicit/no row limits. Add public API regression tests.
- Document the actual 39 implemented functions. The original name union listed
  `Div`, `Round`, and `Switch` without implementations; these names are excluded
  from the public catalogue.
