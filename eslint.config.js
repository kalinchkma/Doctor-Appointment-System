import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/android/**',
      '**/ios/**',
      // Emitted by `tsc -b` alongside vite.config.ts; not source.
      'apps/mobile/vite.config.@(js|d.ts)',
      'apps/payload/src/app/(payload)/admin/importMap.js',
      'apps/payload/src/payload-types.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Test scripts report their results on stdout.
    files: ['**/tests/**/*.ts', '**/seed/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
)
