/**
 * DEVELOPMENT ONLY. Deletes test partners, leads, sales, commissions and payouts so you can start testing again.
 *
 *   npm run reset-test-data -w @hoc/api -- --yes
 *
 * Kept: admin users, partner types and checklists, centres, categories, commission plans and rules,
 * benefits, settings, legal text and message templates. Lead numbers and partner codes start again from 1.
 * Not touched: Supabase login users (the same phone can log in again, as a new partner) and uploaded files
 * in the partner-documents bucket (delete those in the Supabase dashboard if you care).
 */
import { parseArgs } from 'node:util';
import { createDb } from '@hoc/db';
import { config } from 'dotenv';

config({ path: ['.env', '../../.env'], quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✖ DATABASE_URL is not set');
  process.exit(1);
}
const host = new URL(url).hostname;
const { values } = parseArgs({ options: { yes: { type: 'boolean' } } });
if (!values.yes) {
  console.error(`This would delete ALL partners, leads, sales, commissions and payouts in the database at ${host}.\nRun again with --yes if that is what you want.`);
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('✖ Refusing to run with NODE_ENV=production');
  process.exit(1);
}

const { sql } = createDb(url, { max: 1 });
try {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      truncate table
        message_log, push_tokens, bulk_jobs, lead_events, consent_records,
        commission_entries, sale_lines, sales, payouts, payout_batches,
        leads, partner_documents, partner_users, partners, audit_log
      restart identity cascade
    `);
    await tx.unsafe(`delete from plan_assignments where scope = 'partner'`);
  });
  console.log(`✔ Test data cleared at ${host}. Settings, plans, centres and admin users were kept.`);
} finally {
  await sql.end();
}
