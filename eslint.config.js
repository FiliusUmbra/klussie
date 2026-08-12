import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.astro` is generated output from the separate marketing project and
  // is gitignored, so it exists locally but never in a fresh checkout.
  // Without this, `npm run lint` fails on a developer machine while CI
  // passes — a divergence that quietly erodes trust in the gate.
  globalIgnores(['dist', '**/.astro']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // TypeScript files are linted with the same React rules plus the
  // TypeScript ones. Deliberately not type-aware linting: it needs a
  // full type-check per lint run, which would make CI markedly slower
  // for rules that `npm run typecheck` already covers.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['api/**/*.{js,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
