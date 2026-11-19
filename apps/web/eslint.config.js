// @ts-check
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'src/app/routeTree.gen.ts', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  reactHooks.configs.flat['recommended-latest'],
  reactRefresh.configs.vite,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // shadcn/ui components export variants next to components, and TanStack Router route
    // files export `Route` (the router plugin handles their hot reload).
    files: ['src/shared/ui/**', 'src/app/routes/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // TanStack Router redirects are thrown from route guards (`throw redirect(...)`).
    files: ['src/app/routes/**'],
    rules: {
      '@typescript-eslint/only-throw-error': [
        'error',
        { allow: [{ from: 'package', package: '@tanstack/router-core', name: 'Redirect' }] },
      ],
    },
  },
  eslintConfigPrettier,
);
