import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const src = (path: string): string => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    // README examples import the published entry points; map them to the sources.
    alias: [
      { find: /^@afkzona\/fixform\/email$/u, replacement: src('email/index.ts') },
      { find: /^@afkzona\/fixform\/server$/u, replacement: src('server/index.ts') },
      { find: /^@afkzona\/fixform\/node$/u, replacement: src('server/node.ts') },
      { find: /^@afkzona\/fixform\/component\/define$/u, replacement: src('component/define.ts') },
      { find: /^@afkzona\/fixform\/component$/u, replacement: src('component/index.ts') },
      { find: /^@afkzona\/fixform\/react$/u, replacement: src('react/index.ts') },
      { find: /^@afkzona\/fixform\/vue$/u, replacement: src('vue/index.ts') },
      { find: /^@afkzona\/fixform$/u, replacement: src('index.ts') },
    ],
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/annex/data.ts', 'src/cli/bin.ts', 'src/component/define.ts', 'src/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
