import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The *.int.test.ts suites share one local test database and wipe it in beforeAll,
    // so test files run one after another.
    fileParallelism: false,
  },
});
