// ESLint estricto (estándar 34): typescript-eslint + reglas de hooks; `no-explicit-any` ACTIVO.
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'public/**', 'coverage/**', '.expo/**', 'scripts/**', '*.config.js', 'jest.setup.js'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': ['error', { allow: ['error', 'warn'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.jest } },
  },
)
