import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '../../.env' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    // Placeholder lets `generate` run without a database; `migrate` needs the real URL.
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/placeholder',
  },
  strict: true,
  verbose: true,
});
