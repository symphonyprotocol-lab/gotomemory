# @gotomemory/config-ts

Shared ESLint (flat config) and Prettier presets — the single source for TS/JS lint
and format rules across the monorepo (see [monorepo-guide](../../specs/monorepo-guide.md) §7).

```js
// eslint.config.js
import preset from "@gotomemory/config-ts/eslint";
export default preset;
```

```jsonc
// package.json
{ "prettier": "@gotomemory/config-ts/prettier" }
```

Not published. The canonical TypeScript base lives in the root `tsconfig.base.json`,
which packages extend directly.
