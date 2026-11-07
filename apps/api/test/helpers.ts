import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adminUsers, createDb, leads, partnerTypes, partnerUsers, partners, productCategories, type Db } from '@hoc/db';
import { seedDatabase } from '@hoc/db/seed';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { buildApp } from '../src/app';
import { createFieldCipher, type FieldCipher } from '../src/lib/crypto';
import { createDbIdentityResolver } from '../src/lib/identity';
import { createOverviewQuery } from '../src/lib/overview';
import { noopNotifier, type Notifier } from '../src/lib/notify';
import { createConsoleSms, type SmsSender } from '../src/lib/sms';
import type { TokenVerifier } from '../src/lib/token';
import { createCommissionService } from '../src/services/commissions';
import { createEarningsService } from '../src/services/earnings';
import { createLeadService } from '../src/services/leads';
import { createPartnerService } from '../src/services/partners';
import { createPayoutService } from '../src/services/payouts';
import { createPrivacyService } from '../src/services/privacy';
import { createQrCodeService } from '../src/services/qr-codes';
import { createReportService } from '../src/services/reports';
import { createTeamService } from '../src/services/team';
import type { DocumentStorage } from '../src/lib/storage';
import { fakeAuthAdmin } from './fakes';

/** Shared setup for the integration suites that need the whole app on a real, freshly migrated Postgres. */
export function testDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL;
  if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
    throw new Error('TEST_DATABASE_URL must point at localhost: these suites wipe the database.');
  }
  return url;
}

export type Tokens = Record<string, { sub: string; phone?: string; email?: string }>;

export async function createWorld(opts: {
  url: string;
  tokens: Tokens;
  sms?: SmsSender;
  notify?: Notifier | ((db: Db) => Notifier);
  devCodes?: boolean;
  rateLimit?: boolean;
}) {
  const conn = createDb(opts.url, { max: 4 });
  const db: Db = conn.db;
  await conn.sql.unsafe('drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;');
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)) });
  await seedDatabase(db);

  const verifyToken: TokenVerifier = async (t) => {
    const u = opts.tokens[t];
    if (!u) throw new Error('bad token');
    return { sub: u.sub, phone: u.phone ?? null, email: u.email ?? null };
  };
  const cipher: FieldCipher = createFieldCipher(randomBytes(32).toString('base64'));
  const notify = typeof opts.notify === 'function' ? opts.notify(db) : (opts.notify ?? noopNotifier);
  const sms = opts.sms ?? createConsoleSms(() => {});
  const leadsSvc = createLeadService({ db, sms, otpSecret: 'test-secret', devCodes: opts.devCodes ?? false, notify });
  const commissions = createCommissionService({ db, notify });
  const payouts = createPayoutService({ db, cipher, notify });
  const auth = fakeAuthAdmin();
  const removed: string[] = [];
  const storage: DocumentStorage = {
    async put() {},
    async remove(paths) {
      removed.push(...paths);
    },
    async signedUrls() {
      return new Map();
    },
  };
  const earnings = createEarningsService({ db, publicWebUrl: 'http://localhost:3000' });
  const deps = {
    corsOrigins: [],
    verifyToken,
    resolveIdentity: createDbIdentityResolver(db),
    getOverview: createOverviewQuery(db),
    partners: createPartnerService({ db, cipher, storage: {} as never, notify }),
    leads: leadsSvc,
    commissions,
    payouts,
    earnings,
    reports: createReportService({ db }),
    team: createTeamService({ db, authAdmin: auth.admin }),
    privacy: createPrivacyService({ db, authAdmin: auth.admin, storage }),
    qrCodes: createQrCodeService({ db }),
    rateLimit: opts.rateLimit ?? false,
  };
  const app = await buildApp(deps);

  const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.inject({
      method,
      url: `/v1${path}`,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body !== undefined ? { payload: body as object } : {}),
    });

  return {
    db,
    app,
    deps,
    req,
    cipher,
    auth,
    removed,
    commissions,
    leads: leadsSvc,
    close: async () => {
      await app.close();
      await conn.sql.end({ timeout: 2 });
    },
  };
}

export async function addAdmins(db: Db, tokens: Tokens) {
  await db.insert(adminUsers).values([
    { authUserId: tokens.admin!.sub, email: 'admin@ho.test', name: 'Asha Admin', role: 'admin' },
    { authUserId: tokens.agent!.sub, email: 'agent@ho.test', name: 'Ravi Agent', role: 'agent' },
  ]);
}

export async function addPartner(
  db: Db,
  o: { token?: { sub: string }; name: string; phone: string; code: string | null; status?: 'approved' | 'submitted' | 'suspended'; city?: string },
) {
  const [salon] = await db.select().from(partnerTypes).where(eq(partnerTypes.slug, 'salon'));
  const [p] = await db
    .insert(partners)
    .values({ partnerTypeId: salon!.id, businessName: o.name, ownerName: o.name, phone: o.phone, status: o.status ?? 'approved', code: o.code, city: o.city ?? 'New Delhi' })
    .returning();
  let userId: string | null = null;
  if (o.token) {
    const [u] = await db.insert(partnerUsers).values({ partnerId: p!.id, authUserId: o.token.sub, phone: o.phone }).returning({ id: partnerUsers.id });
    userId = u!.id;
  }
  return { partner: p!, partnerUserId: userId };
}

export const newToken = (extra: { phone?: string; email?: string } = {}) => ({ sub: randomUUID(), ...extra });

export async function categories(db: Db) {
  return db.select().from(productCategories);
}

/** A lead already through consent and verification, owned by the partner. */
export async function verifiedLead(db: Db, partnerId: string, o: Partial<typeof leads.$inferInsert> = {}) {
  const [l] = await db
    .insert(leads)
    .values({
      partnerId,
      channel: 'assisted',
      customerName: 'Meera Kapoor',
      customerPhone: `99${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      consentStatus: 'confirmed',
      consentConfirmedAt: new Date(Date.now() - 10 * 86400_000),
      stage: 'consultation_done',
      customerType: 'new',
      ownedUntil: new Date(Date.now() + 80 * 86400_000),
      ...o,
    })
    .returning();
  return l!;
}
