import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  },
  {
    files: ["api/**/*.ts"],
    languageOptions: { globals: globals.node }
  },
  {
    /* Derivations must take the date they work from, never read the clock.
       A helper that accepts `today` and then calls todayISO() disagrees with
       its own caller — that shipped once and broke the suite at midnight. */
    files: ["src/utils/**/*.ts"],
    ignores: ["src/utils/dates.ts", "src/utils/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "./dates",
              importNames: ["todayISO"],
              message:
                "Pure helpers take `today` as an argument. Let the screen call todayISO() once and pass it down."
            }
          ]
        }
      ]
    }
  }
);
