import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-console": "warn",
      "no-unused-vars": "off",
      "prefer-const": "error",
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
];
