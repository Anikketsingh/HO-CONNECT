/**
 * Creates (or updates) a dashboard user: a Supabase Auth email user + an admin_users row.
 *
 *   npm run create-admin -w @hoc/api -- --email you@hairoriginals.com --name "Your Name" --role admin
 *
 * Options: --role admin|agent (default agent), --password <pw> (default: generated and printed once).
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { adminUsers, createDb } from '@hoc/db';
import { ADMIN_ROLES, type AdminRole } from '@hoc/shared';
import { createClient, type User } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: ['.env', '../../.env'], quiet: true });

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'agent' },
    password: { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const email = values.email?.trim().toLowerCase() ?? fail('--email is required');
const name = values.name?.trim() ?? fail('--name is required');
const role = values.role as AdminRole;
if (!ADMIN_ROLES.includes(role)) fail(`--role must be one of: ${ADMIN_ROLES.join(', ')}`);

const supabaseUrl = process.env.SUPABASE_URL ?? fail('SUPABASE_URL is not set');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fail('SUPABASE_SERVICE_ROLE_KEY is not set');
const databaseUrl = process.env.DATABASE_URL ?? fail('DATABASE_URL is not set');

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserByEmail(target: string): Promise<User | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
}

const generated = !values.password;
const password = values.password ?? randomBytes(12).toString('base64url');

let user = await findUserByEmail(email);
if (user) {
  console.log(`• Supabase user already exists for ${email}; keeping their password.`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) fail(`Could not create Supabase user: ${error?.message ?? 'unknown error'}`);
  user = data.user;
  console.log(`• Created Supabase user ${email}`);
}

const { db, sql } = createDb(databaseUrl, { max: 1 });
try {
  await db
    .insert(adminUsers)
    .values({ authUserId: user.id, email, name, role, active: true })
    .onConflictDoUpdate({ target: adminUsers.authUserId, set: { name, role, active: true, email } });
  console.log(`✔ ${email} is now a dashboard ${role}.`);
  if (generated && !user.last_sign_in_at) {
    console.log(`  Temporary password (shown once): ${password}`);
  }
} finally {
  await sql.end();
}
