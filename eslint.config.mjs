// ESLint 9+/10 flat config. `.eslintrc*` is not used anywhere in this project.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `frontend/` is a separate project with its own ESLint config and dependencies.
  { ignores: ['dist/**', 'node_modules/**', 'drizzle/**', 'coverage/**', 'frontend/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      // Fastify plugins and hooks are idiomatically `async` even when they never await.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Tests parse untyped JSON responses (`response.json()`), so the no-unsafe-* family is noise there.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
