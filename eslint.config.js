import js from '@eslint/js';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['src/**', 'dist/**', '.output/**', '.wxt/**', 'node_modules/**', '**/*.ts', '**/*.tsx'] },
  js.configs.recommended,
  { files: ['**/*.{js,jsx,mjs,cjs}'], languageOptions: { globals: { ...globals.browser, ...globals.node }, parserOptions: { ecmaFeatures: { jsx: true } } } },
  { files: ['extension/**/*.jsx'], plugins: { 'react-hooks': hooks }, rules: { ...hooks.configs.recommended.rules, 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]', argsIgnorePattern: '^_' }] } },
];
