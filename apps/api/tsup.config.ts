import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  clean: true,
  // Workspace packages ship TypeScript source, so bundle them; npm deps stay external.
  noExternal: [/^@hoc\//],
});
