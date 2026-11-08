// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'dist-typecheck/', 'coverage/', 'node_modules/', 'test/.doctest/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['scripts/*.mjs', 'examples/*/*.mjs', 'examples/*/public/*.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent / createElement.' },
        { property: 'outerHTML', message: 'Use textContent / createElement.' },
        { property: 'insertAdjacentHTML', message: 'Use createElement.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.object.name='document'][callee.property.name='write']", message: 'No document.write.' },
      ],
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['scripts/**/*.mjs', 'examples/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', fetch: 'readonly', URL: 'readonly', setTimeout: 'readonly', Buffer: 'readonly' },
    },
  },
  {
    files: ['examples/**/public/*.js'],
    languageOptions: {
      globals: { document: 'readonly', window: 'readonly', fetch: 'readonly' },
    },
  },
);
