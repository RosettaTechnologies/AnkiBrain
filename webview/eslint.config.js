import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'build/**', 'node_modules/**'],
  },
  {
    // Legacy app code (.js/.jsx): parser + environment only, no style rules
    // (the project previously ran with rules disabled).
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
  },
  ...tseslint.configs.recommended,
  {
    // Legacy JS was written without any linting (CRA rules were disabled).
    // Keep hygiene signals as warnings and don't flag intentionally unused
    // catch/argument params.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "none",
          caughtErrors: "none",
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
      "no-unused-vars": "off",
    },
  },
)
