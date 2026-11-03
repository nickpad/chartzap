# Releases

This release is GitHub-only. All package manifests remain `private: true` to
prevent accidental npm publication. Tags identify GitHub source releases;
compiled tarballs are verified in a clean consumer before a release is approved.

## Local consumption

Clone the repository, run `pnpm install --frozen-lockfile` and `pnpm build`, then:

```sh
mkdir -p artifacts
pnpm --filter @chartzap/core pack --pack-destination "$PWD/artifacts"
pnpm --filter @chartzap/postgres pack --pack-destination "$PWD/artifacts"
pnpm --filter @chartzap/codemirror pack --pack-destination "$PWD/artifacts"
```

In a consumer, point dependencies at those tarballs. Since internal packages are
not in the npm registry, pnpm also needs an override directing transitive core
references to the same local archive:

```json
{
  "type": "module",
  "dependencies": {
    "@chartzap/core": "file:../artifacts/chartzap-core-0.1.0.tgz",
    "@chartzap/postgres": "file:../artifacts/chartzap-postgres-0.1.0.tgz",
    "@chartzap/codemirror": "file:../artifacts/chartzap-codemirror-0.1.0.tgz"
  },
  "pnpm": {
    "overrides": {
      "@chartzap/core": "file:../artifacts/chartzap-core-0.1.0.tgz"
    }
  }
}
```

React is optional for the headless CodeMirror entry point. Install React 19 when
using `@chartzap/codemirror/react`. `pnpm test:packages` creates a fresh temporary
consumer, packs all three packages, verifies every export without DOM globals,
checks TypeScript declarations, and compiles a query using the archives.
`PACKAGE_TEST_OFFLINE=1` uses the local pnpm cache instead of the registry.

## Release checks

1. Run formatting, lint, builds, typecheck, all unit/browser/PostgreSQL tests,
   tarball checks, and the playground production build.
2. Regenerate the parser and check a clean diff. Review generated-file provenance
   and dependency licences; keep `THIRD_PARTY_NOTICES.md` current.
3. Run a secret scanner over working files and **all new Git history**. Review
   private URLs, local paths, addresses, fixtures, and application-only vocabulary.
4. Review the candidate while the new GitHub repository is still private.
5. Obtain the owner’s approval for contents, licence, release, and public visibility.
6. Make this new repository public and tag `v0.1.0` only after that approval.
   Never alter visibility of the private application repository.
7. Publish the static playground only with an approved hosting destination. The
   Vite build uses relative asset paths and works on a GitHub Pages project path.

Npm publication would require a separate explicit decision about names,
registry access, metadata, and a new approval. There is no npm release workflow.

## Runtime policy

ESM only. The CI matrix targets Node 22 and 24 with pnpm 10. Browser integration
is tested in Chromium; no compatibility claim is made for other browsers.
PostgreSQL execution is tested on 18. Changes to those claims require passing
checks on the corresponding versions. Before CI has actually run, the workflow
configuration alone is not evidence of a green matrix.
