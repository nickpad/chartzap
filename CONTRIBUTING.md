# Contributing

Use Node 22 or 24 and pnpm 10. Install with `pnpm install --frozen-lockfile`.
The packages build in dependency order with `pnpm build`. Run `pnpm dev` for the
browser-only playground. No application secrets or services are required.

Before opening a change:

```sh
pnpm generate
pnpm format
pnpm lint
pnpm build
pnpm typecheck
pnpm test
pnpm exec playwright install chromium --only-shell
pnpm test:browser
pnpm test:packages
pnpm build:playground
```

`pnpm generate` must leave the committed generated parser unchanged unless the
grammar or generator version intentionally changed. Generated files are excluded
from formatting. Use Conventional Commits and add focused regression tests for
semantic changes. Keep the core independent of web frameworks, SQL execution,
and database drivers. Do not add a graph cycle without designing explicit path
selection and planner semantics first.

## PostgreSQL tests

Use a disposable database: the fixture creates and truncates `atelier` tables.
Do not use a production or application database.

```sh
docker run --rm -d --name chartzap-postgres-test \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=chartzap_engine_test \
  -p 127.0.0.1:55439:5432 postgres:18
# Wait for: docker exec chartzap-postgres-test pg_isready -U postgres
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/chartzap_engine_test pnpm test:integration
docker stop chartzap-postgres-test
```

The driver is development-only. CI runs the same tests against an isolated
PostgreSQL 18 service. Browser tests use Chromium through Vitest’s Playwright
provider. Use `pnpm test -- path/to/test.ts` to focus a unit suite.

## Reports and scope

For bug reports, include a minimal schema seed, formulas, expected behavior,
and actual diagnostics or SQL. Keep credentials and real business data out of
fixtures and issues. Report security problems through [SECURITY.md](SECURITY.md).
Contributions are provided under the repository’s MIT licence.
