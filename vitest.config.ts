import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/worker/entry.ts', 'src/frame/relay.ts', 'src/core/sandbox.ts', 'src/index.ts', 'src/ai.ts', 'src/codemode.ts', 'src/tanstack.ts', 'src/frame.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        'src/core/**': { statements: 90, branches: 85 },
        'src/bridge/**': { statements: 90, branches: 85 },
        'src/functions/**': { statements: 90, branches: 85 },
        'src/worker/**': { statements: 100, branches: 90 },
        'src/frame/**': { statements: 100, branches: 90 },
      },
    },
  },
});
