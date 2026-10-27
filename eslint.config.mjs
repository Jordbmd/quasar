import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "release/**",
      ".runtime/**",
      "test-results/**",
      "storybook-static/**",
      "assets/**",
      "build/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin, "react-hooks": hooks },
    rules: {
      "no-async-promise-executor": "error",
      "no-unsafe-finally": "error",
      "no-constant-binary-expression": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: false },
      ],
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
