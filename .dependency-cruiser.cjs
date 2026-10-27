module.exports = {
  forbidden: [
    { name: "no-cycles", severity: "error", from: {}, to: { circular: true } },
    {
      name: "renderer-has-no-privileges",
      severity: "error",
      from: { path: "^src/renderer" },
      to: { path: "^(src/main|electron$|node:)" },
    },
    {
      name: "shared-is-independent",
      severity: "error",
      from: { path: "^src/shared" },
      to: { path: "^(src/(main|renderer)|electron$|node:)" },
    },
    {
      name: "main-does-not-import-ui",
      severity: "error",
      from: { path: "^src/main" },
      to: { path: "^src/renderer" },
    },
    {
      name: "no-unresolved",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    exclude: "(^|/)(dist|release|test-results|\.runtime|storybook-static)/",
    enhancedResolveOptions: {
      extensions: [".js", ".jsx", ".ts", ".tsx", ".json", ".cjs", ".mjs"],
    },
  },
};
