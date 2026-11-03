# Security policy

For a suspected vulnerability, use GitHub’s private vulnerability reporting for
this repository when enabled. If unavailable, contact the maintainer through
the contact links on [Nick Dainty’s GitHub profile](https://github.com/nickpad)
to establish a private reporting channel. Do not post credentials, customer data,
or an exploitable deployment configuration in a public issue.

This project compiles formulas; it does not connect to a database or execute SQL.
Use the parameterized API and pass `sql.parameters` separately to your driver.
Schemas and low-level AST/IR inputs are trusted programmer configuration.
Validate untrusted request bodies before invoking the TypeScript API, and set
query timeouts/limits in the application that executes queries.

Until a stable release policy is established, security fixes target the newest
tagged release only. Pre-release support and compatibility are best effort.
