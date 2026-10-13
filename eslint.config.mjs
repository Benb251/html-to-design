import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "coverage/**"],
  },
  eslint.configs.recommended,
  { files: ["**/*.mjs"], languageOptions: { globals: { console: "readonly", URL: "readonly", process: "readonly", WebSocket: "readonly", setTimeout: "readonly", clearTimeout: "readonly", Buffer: "readonly", fetch: "readonly" } } },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error"
    }
  }
);

