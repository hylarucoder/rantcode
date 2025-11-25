import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // Disallow empty blocks; allow empty catch for deliberate ignore cases
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Avoid wrapping try/catch that only rethrows
      'no-useless-catch': 'error',
      // Use TypeScript's inference broadly; do not force explicit returns
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Using TypeScript, no need for prop-types
      'react/prop-types': 'off',
      // Relax refresh rule + new React compiler heuristics to avoid noisy warnings while refactoring
      'react-refresh/only-export-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'off'
    }
  },
  eslintConfigPrettier
)
