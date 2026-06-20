# Changesets

This folder holds [changesets](https://github.com/changesets/changesets). Any PR that
changes the behavior of a published package (`@gotomemory/sdk`, `@gotomemory/cli`, the
Python SDK) must include a changeset:

```bash
pnpm changeset
```

See [monorepo-guide](../specs/monorepo-guide.md) §10 for the release rules — including
that the CLI `--json`/exit-code contract is treated as a public interface.
