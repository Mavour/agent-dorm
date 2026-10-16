import js from '@eslint/js';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  performance: 'readonly',
  WebSocket: 'readonly',
  Image: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Intl: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  console: 'readonly',
};

const nodeGlobals = {
  ...browserGlobals,
  AbortController: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  globalThis: 'readonly',
};

const unusedVars = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];

export default [
  { ignores: ['node_modules/**', 'assets_ready/**', 'examples/**', '.env'] },
  {
    files: ['public/js/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: browserGlobals },
    ...js.configs.recommended,
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': unusedVars },
  },
  {
    files: ['server/**/*.js', 'scripts/**/*.js', 'test/**/*.js', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: nodeGlobals },
    ...js.configs.recommended,
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': unusedVars },
  },
  {
    files: ['ecosystem.config.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...nodeGlobals, module: 'writable', require: 'readonly' },
    },
    ...js.configs.recommended,
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': unusedVars },
  },
];
