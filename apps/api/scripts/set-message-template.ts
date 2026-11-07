/**
 * Sets the DLT-registered text and template id of an SMS the API sends.
 *
 *   npm run message-template -w @hoc/api -- --key consent_otp --template-id 1707… --body "Your … code is {{otp}}. …"
 *   npm run message-template -w @hoc/api -- --key consent_otp --from-env     # NIMBUS_TEMPLATE_ID + NIMBUS_OTP_TEMPLATE from .env
 *   npm run message-template -w @hoc/api -- --key customer_nudge --template-id 1707… --body "Hi {{customer_name}}, …"
 *
 * Keys and the {{placeholders}} each one may use:
 *   consent_otp     {{otp}} (required), {{partner_name}}, {{hours}}
 *   customer_nudge  {{customer_name}}, {{partner_name}}
 * The body must match the DLT template byte for byte, with a placeholder where the registered template has {#var#}.
 * "{otp}" (single braces, as in the Supabase hook) is accepted and converted. `npm run consent-template` is the same command.
 */
import { parseArgs } from 'node:util';
import { createDb, messageTemplates } from '@hoc/db';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

config({ path: ['.env', '../../.env'], quiet: true });

const KEYS: Record<string, { allowed: string[]; required: string[] }> = {
  consent_otp: { allowed: ['otp', 'partner_name', 'hours'], required: ['otp'] },
  customer_nudge: { allowed: ['customer_name', 'partner_name'], required: [] },
};

const { values } = parseArgs({
  options: { key: { type: 'string', default: 'consent_otp' }, 'template-id': { type: 'string' }, body: { type: 'string' }, 'from-env': { type: 'boolean' } },
});

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const key = values.key ?? 'consent_otp';
const spec = KEYS[key] ?? fail(`--key must be one of: ${Object.keys(KEYS).join(', ')}`);
if (values['from-env'] && key !== 'consent_otp') fail('--from-env only works for consent_otp');

const templateId = (values['from-env'] ? process.env.NIMBUS_TEMPLATE_ID : values['template-id'])?.trim();
const rawBody = (values['from-env'] ? process.env.NIMBUS_OTP_TEMPLATE : values.body)?.trim();
if (!templateId || !/^\d{10,25}$/.test(templateId)) fail('A numeric DLT template id is required (--template-id or --from-env)');
if (!rawBody) fail('The template text is required (--body or --from-env)');

const body = rawBody.replace(/\{\{?(\w+)\}?\}/g, '{{$1}}');
const used = [...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!);
const unknown = used.filter((u) => !spec.allowed.includes(u));
if (unknown.length) fail(`${key} can't fill {{${unknown.join('}}, {{')}}}. Allowed: ${spec.allowed.map((a) => `{{${a}}}`).join(', ')}`);
for (const r of spec.required) if (!used.includes(r)) fail(`The text must contain {{${r}}}`);

const { db, sql } = createDb(process.env.DATABASE_URL ?? fail('DATABASE_URL is not set'), { max: 1 });
try {
  const updated = await db
    .update(messageTemplates)
    .set({ body, providerTemplateId: templateId, channel: 'sms' })
    .where(eq(messageTemplates.key, key))
    .returning({ key: messageTemplates.key });
  if (updated.length === 0) fail(`No ${key} template found. Run npm run db:seed first.`);
  console.log(`✔ ${key} now uses DLT template ${templateId} (SMS)`);
  console.log(`  "${body}"`);
} finally {
  await sql.end();
}
