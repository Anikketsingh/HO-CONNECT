/**
 * Idempotent seed: safe to run more than once. Existing rows are left untouched.
 * Usage (from the repo root): npm run db:seed
 */
import { config } from 'dotenv';
import { createDb } from './client';
import { centres, documentTypes, partnerTypes, productCategories } from './schema/index';
import { seedDatabase } from './seed-lib';

config({ path: '../../.env' });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');
  const { db, sql } = createDb(url, { max: 1 });

  try {
    await seedDatabase(db);
    const counts = {
      partnerTypes: (await db.select().from(partnerTypes)).length,
      documentTypes: (await db.select().from(documentTypes)).length,
      productCategories: (await db.select().from(productCategories)).length,
      centres: (await db.select().from(centres)).length,
    };
    console.log('Seed complete:', counts);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
