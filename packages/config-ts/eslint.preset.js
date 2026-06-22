// Shared ESLint flat config for the gotomemory monorepo.
// Consumed by the root eslint.config.js and (later) per-package configs.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Never lint build output, caches, or committed codegen artifacts.
    ignores: [
      "**/dist/**",
      "**/.turbo/**",
      "**/.output/**",
      "**/.wxt/**",
      "**/coverage/**",
      "**/generated/**",
      "**/node_modules/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
