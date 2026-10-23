import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    ignores: ['docs/**', 'coverage/**', 'node_modules/**', 'plugin/**/assets/**'],
  },
  js.configs.recommended,
  {
    files: ['bin/**/*.js', 'lib/**/*.js', 'scripts/**/*.{js,mjs}', 'test/**/*.js', 'plugin/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
]
