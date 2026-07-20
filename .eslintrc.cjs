/**
 * Single repo-wide ESLint config (eslintrc, ESLint 8 + typescript-eslint 7).
 * Runs from the root over every workspace so there is one source of lint truth.
 * Next.js's build-time lint is disabled (see apps/web/next.config.mjs) to keep it this way.
 */
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  env: {
    node: true,
    es2022: true,
    browser: true,
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    // CLAUDE.md hard convention: no `any` in committed code.
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    "no-console": "off",
  },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    ".next/",
    ".turbo/",
    "coverage/",
    "docs/_reference/",
    "**/next-env.d.ts",
    "**/*.config.js",
    "**/*.config.cjs",
    "**/*.config.mjs",
  ],
};
