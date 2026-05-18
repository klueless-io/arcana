import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/*/src/**/*.{test,spec}.ts'],
    passWithNoTests: true,
    coverage: {
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.{test,spec}.ts', '**/dist/**'],
    },
  },
});
