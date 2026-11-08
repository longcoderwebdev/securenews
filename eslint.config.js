const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.jest } },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], eqeqeq: 'error' },
  },
  { ignores: ['node_modules/', 'public/', 'coverage/'] },
];