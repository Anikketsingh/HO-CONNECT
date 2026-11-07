/**
 * Money against a real Postgres: plans and rules → record sale → commission → hold → approval.
 * Skipped unless TEST_DATABASE_URL is set (see partners.int.test.ts). Wipes the database.
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  adminUsers,
  commissionEntries,
  commissionPlans,
  createDb,
  leads,
  partnerTypes,
  partnerUsers,
  partners,
  productCategories,
  sales,
  type Db,
} from '@hoc/db';
import { seedDatabase } from '@hoc/db/seed';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app';
import { createFieldCipher } from '../src/lib/crypto';
import { createDbIdentityResolver } from '../src/lib/identity';
import { createOverviewQuery } from '../src/lib/overview';
import { createConsoleSms } from '../src/lib/sms';
import type { TokenVerifier } from '../src/lib/token';
import { createCommissionService, type CommissionService } from '../src/services/commissions';
import { createLeadService } from '../src/services/leads';
import { createEarningsService } from '../src/services/earnings';
import { createPartnerService } from '../src/services/partners';
import { createPayoutService } from '../src/services/payouts';
import { createPrivacyService } from '../src/services/privacy';
import type { QrCodeService } from '../src/services/qr-codes';
import { createReportService } from '../src/services/reports';
import { createTeamService } from '../src/services/team';
import { fakeAuthAdmin } from './fakes';

const url = process.env.TEST_DATABASE_URL;
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL must point at localhost: this suite wipes the database.');
}

const tokens: Record<string, { sub: string; phone?: string; email?: string }> = {
  glow: { sub: randomUUID(), phone: '919811111111' },
  admin: { sub: randomUUID(), email: 'admin@ho.test' },
  agent: { sub: randomUUID(), email: 'agent@ho.test' },
};
const verifyToken: TokenVerifier = async (t) => {
  const u = tokens[t];
  if (!u) throw new Error('bad token');
  return { sub: u.sub, phone: u.phone ?? null, email: u.email ?? null };
};

let app: App;
let db: Db;
let money: CommissionService;
let closeDb: () => Promise<void>;
let partnerId = '';
let salonTypeId = '';
let PATCH = '';
let WIG = '';
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, token?: string, body?: unknown) =>
  app.inject({
    method,
    url: `/v1${path}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body !== undefined ? { payload: body as object } : {}),
  });

/** A lead already through consent and verification. */
async function verifiedLead(o: Partial<typeof leads.$inferInsert> = {}) {
  const [l] = await db
    .insert(leads)
    .values({
      partnerId,
      channel: 'assisted',
      customerName: 'Meera Kapoor',
      customerPhone: `99${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      consentStatus: 'confirmed',
      consentConfirmedAt: daysAgo(10),
      stage: 'consultation_done',
      customerType: 'new',
      ownedUntil: new Date(Date.now() + 80 * 86400_000),
      ...o,
    })
    .returning();
  return l!;
}

const sale = (lines: [string, number][], extra: Record<string, unknown> = {}) => ({
  saleDate: today,
  invoiceNo: 'INV-2026-0042',
  lines: lines.map(([categoryId, rupees]) => ({ categoryId, netPaise: rupees * 100 })),
  ...extra,
});

describe.skipIf(!url)('commissions (Postgres)', () => {
  beforeAll(async () => {
    const conn = createDb(url!, { max: 4 });
    db = conn.db;
    closeDb = () => conn.sql.end({ timeout: 2 });
    await conn.sql.unsafe('drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;');
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)) });
    await seedDatabase(db);
    await db.insert(adminUsers).values([
      { authUserId: tokens.admin!.sub, email: 'admin@ho.test', name: 'Asha Admin', role: 'admin' },
      { authUserId: tokens.agent!.sub, email: 'agent@ho.test', name: 'Ravi Agent', role: 'agent' },
    ]);
    const [salon] = await db.select().from(partnerTypes).where(eq(partnerTypes.slug, 'salon'));
    salonTypeId = salon!.id;
    const [p] = await db
      .insert(partners)
      .values({ partnerTypeId: salonTypeId, businessName: 'Glow Studio', phone: '9811111111', status: 'approved', code: 'HOC00001', city: 'New Delhi' })
      .returning();
    partnerId = p!.id;
    await db.insert(partnerUsers).values({ partnerId, authUserId: tokens.glow!.sub, phone: '9811111111' });
    const cats = await db.select().from(productCategories);
    PATCH = cats[0]!.id;
    WIG = cats[1]!.id;

    money = createCommissionService({ db });
    app = await buildApp({
      corsOrigins: [],
      verifyToken,
      resolveIdentity: createDbIdentityResolver(db),
      getOverview: createOverviewQuery(db),
      partners: createPartnerService({ db, cipher: createFieldCipher(Buffer.alloc(32, 1).toString('base64')), storage: {} as never }),
      leads: createLeadService({ db, sms: createConsoleSms(() => {}), otpSecret: 't', devCodes: false }),
      commissions: money,
      payouts: createPayoutService({ db, cipher: createFieldCipher(Buffer.alloc(32, 1).toString('base64')) }),
      earnings: createEarningsService({ db, publicWebUrl: 'http://localhost:3000' }),
      reports: createReportService({ db }),
      team: createTeamService({ db, authAdmin: fakeAuthAdmin().admin }),
      privacy: createPrivacyService({ db, authAdmin: fakeAuthAdmin().admin, storage: { put: async () => {}, remove: async () => {}, signedUrls: async () => new Map() } }),
      qrCodes: {} as QrCodeService, // covered by test/qr-codes.int.test.ts
    });
  });

  afterAll(async () => {
    await app?.close();
    await closeDb?.();
  });

  let salonPlanId = '';
  let defaultPlanId = '';

  it('lets admins (not agents) set up plans, rules and assignments', async () => {
    const plans = (await req('GET', '/admin/commission-plans', 'agent')).json();
    const def = plans.plans.find((p: { name: string }) => p.name === 'Default plan');
    defaultPlanId = def.id;
    expect(def.assignedTo).toEqual([{ scope: 'default', scopeId: null, label: 'Default for everyone' }]);
    expect(def.rules).toHaveLength(3);

    const body = { name: 'Salon pilot', effectiveFrom: '2026-01-01' };
    expect((await req('POST', '/admin/commission-plans', 'agent', body)).statusCode).toBe(403);
    salonPlanId = (await req('POST', '/admin/commission-plans', 'admin', body)).json().id;
    const anyRule = { categoryId: null, customerType: null, rateType: 'percent', rateValue: 800, minPaise: null, maxPaise: 400_000 };
    expect((await req('POST', `/admin/commission-plans/${salonPlanId}/rules`, 'admin', anyRule)).statusCode).toBe(201);
    expect(
      (await req('POST', `/admin/commission-plans/${salonPlanId}/rules`, 'admin', { ...anyRule, categoryId: PATCH, rateValue: 1200, maxPaise: null })).statusCode,
    ).toBe(201);
    expect((await req('POST', `/admin/commission-plans/${salonPlanId}/rules`, 'admin', { ...anyRule, rateValue: 20_000 })).statusCode).toBe(400);

    expect((await req('PUT', '/admin/plan-assignments', 'admin', { scope: 'partner_type', scopeId: salonTypeId, planId: salonPlanId })).statusCode).toBe(204);
    expect((await req('GET', `/admin/partners/${partnerId}/plan`, 'agent')).json().effective).toMatchObject({ name: 'Salon pilot', via: 'partner_type' });

    // A partner override wins, and removing it falls back again.
    await req('PUT', '/admin/plan-assignments', 'admin', { scope: 'partner', scopeId: partnerId, planId: defaultPlanId });
    expect((await req('GET', `/admin/partners/${partnerId}/plan`, 'agent')).json()).toMatchObject({
      effective: { name: 'Default plan', via: 'partner' },
      overridePlanId: defaultPlanId,
    });
    await req('PUT', '/admin/plan-assignments', 'admin', { scope: 'partner', scopeId: partnerId, planId: null });
    expect((await req('GET', `/admin/partners/${partnerId}/plan`, 'agent')).json().effective.via).toBe('partner_type');
    expect((await req('PUT', '/admin/plan-assignments', 'admin', { scope: 'default', scopeId: null, planId: null })).statusCode).toBe(400);

    const listed = (await req('GET', '/admin/commission-plans', 'agent')).json().plans.find((p: { id: string }) => p.id === salonPlanId);
    expect(listed.rules.map((r: { description: string }) => r.description)).toEqual(
      expect.arrayContaining(['8% of net value · any product · any customer · max ₹4,000', expect.stringMatching(/^12% of net value · .+ · any customer$/)]),
    );
  });

  let leadId = '';
  let commissionId = '';

  it('previews the commission line by line before saving', async () => {
    const lead = await verifiedLead();
    leadId = lead.id;
    const preview = (await req('POST', `/admin/leads/${leadId}/sales/preview`, 'agent', sale([[PATCH, 25_000], [WIG, 60_000]]))).json();
    expect(preview).toMatchObject({
      eligible: true,
      plan: { name: 'Salon pilot', via: 'partner_type' },
      totalPaise: 700_000, // 12% of ₹25,000 = ₹3,000, plus 8% of ₹60,000 = ₹4,800 capped at ₹4,000
      flags: [],
    });
    expect(preview.lines.map((l: { amountPaise: number }) => l.amountPaise)).toEqual([300_000, 400_000]);
    expect(preview.holdUntil).toBe(new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86400_000).toISOString().slice(0, 10));
    expect((await db.select().from(sales)).length).toBe(0); // nothing saved
  });

  it('records the sale, creates the commission and shows the partner only their commission', async () => {
    const res = await req('POST', `/admin/leads/${leadId}/sales`, 'agent', sale([[PATCH, 25_000], [WIG, 60_000]], { notes: 'Paid by card' }));
    expect(res.statusCode).toBe(201);
    commissionId = res.json().commissionId;
    const [entry] = await db.select().from(commissionEntries).where(eq(commissionEntries.id, commissionId));
    expect(entry).toMatchObject({ status: 'pending', amountPaise: 700_000, flagged: false });
    expect(entry!.ruleSnapshot.planName).toBe('Salon pilot');

    const mine = (await req('GET', `/partner/leads/${leadId}`, 'glow')).json();
    expect(mine).toMatchObject({ stage: 'purchased', stageLabel: 'Purchased', commission: { amountPaise: 700_000, label: 'Commission ₹7,000 pending' } });
    expect(mine.timeline.at(-1).label).toBe('Purchased');
    const text = JSON.stringify(mine);
    expect(text).not.toMatch(/INV-2026|2500000|6000000|8500000|Paid by card/);
    expect((await req('GET', '/partner/leads', 'glow')).json().items[0].commission.label).toBe('Commission ₹7,000 pending');
  });

  it('pays only the first purchase', async () => {
    const second = (await req('POST', `/admin/leads/${leadId}/sales`, 'agent', sale([[WIG, 10_000]]))).json();
    expect(second.commissionId).toBeNull();
    expect(second.preview.ineligibleReason).toBe('This lead already earned its commission (first purchase only).');
    const detail = (await req('GET', `/admin/leads/${leadId}`, 'agent')).json();
    expect(detail.sales).toHaveLength(2);
  });

  it('refuses unverified leads and future dates, and pays nothing outside the window', async () => {
    const unverified = await verifiedLead({ stage: 'under_review', customerType: null });
    expect((await req('POST', `/admin/leads/${unverified.id}/sales/preview`, 'agent', sale([[WIG, 1000]]))).json().error.code).toBe('not_verified');
    const lead = await verifiedLead();
    expect((await req('POST', `/admin/leads/${lead.id}/sales/preview`, 'agent', sale([[WIG, 1000]], { saleDate: '2099-01-01' }))).json().error.code).toBe(
      'future_date',
    );
    const lapsed = await verifiedLead({ consentConfirmedAt: daysAgo(120), ownedUntil: daysAgo(30) });
    const p = (await req('POST', `/admin/leads/${lapsed.id}/sales/preview`, 'agent', sale([[WIG, 10_000]]))).json();
    expect(p).toMatchObject({ eligible: false, totalPaise: 0 });
    expect(p.ineligibleReason).toMatch(/^The sale is after the ownership window ended on /);
    const early = (await req('POST', `/admin/leads/${lead.id}/sales/preview`, 'agent', sale([[WIG, 10_000]], { saleDate: daysAgo(30).toISOString().slice(0, 10) }))).json();
    expect(early.ineligibleReason).toMatch(/^The sale is before the customer was referred/);
  });

  it('flags existing customers and hand-linked sales for review', async () => {
    const lead = await verifiedLead({ customerType: 'existing_customer' });
    const r = (await req('POST', `/admin/leads/${lead.id}/sales`, 'agent', sale([[WIG, 10_000]], { linkedManually: true }))).json();
    expect(r.preview.flags.map((f: { key: string }) => f.key)).toEqual(['existing_customer_type', 'linked_manually']);
    const [entry] = await db.select().from(commissionEntries).where(eq(commissionEntries.id, r.commissionId));
    expect(entry).toMatchObject({ flagged: true, amountPaise: 80_000 });
    const flagged = (await req('GET', '/admin/commissions?view=flagged', 'agent')).json();
    expect(flagged.items.map((i: { id: string }) => i.id)).toContain(r.commissionId);
  });

  it('releases the hold, then only admins approve', async () => {
    await db.update(commissionEntries).set({ holdUntil: '2020-01-01' }).where(eq(commissionEntries.id, commissionId));
    expect(await money.advanceHolds()).toEqual({ released: 1, autoApproved: 0 });
    const list = (await req('GET', '/admin/commissions?view=approvable', 'agent')).json();
    expect(list).toMatchObject({ total: 1, sumPaise: 700_000 });
    expect(list.counts).toMatchObject({ approvable: 1, pending: 1, flagged: 1 });

    expect((await req('POST', '/admin/commissions/approve', 'agent', { ids: [commissionId] })).statusCode).toBe(403);
    expect((await req('POST', '/admin/commissions/approve', 'admin', { ids: [commissionId, randomUUID()] })).json()).toEqual({ approved: 1, skipped: 1 });
    expect((await req('GET', `/partner/leads/${leadId}`, 'glow')).json().commission.label).toBe('Commission ₹7,000 approved');
  });

  it('adjusts with a reason and asks for approval again', async () => {
    expect((await req('POST', `/admin/commissions/${commissionId}/adjust`, 'admin', { adjustmentPaise: -50_000, reason: 'ok' })).statusCode).toBe(400);
    expect((await req('POST', `/admin/commissions/${commissionId}/adjust`, 'admin', { adjustmentPaise: -800_000, reason: 'Too much off' })).json().error.code).toBe(
      'negative_amount',
    );
    expect((await req('POST', `/admin/commissions/${commissionId}/adjust`, 'admin', { adjustmentPaise: -50_000, reason: 'Wig line was a discounted display piece' })).statusCode).toBe(204);
    const d = (await req('GET', `/admin/commissions/${commissionId}`, 'agent')).json();
    expect(d).toMatchObject({ status: 'approvable', amountPaise: 650_000, calculatedPaise: 700_000, flagged: true, flags: ['adjusted'] });
    expect(d.snapshot.lines.map((l: { rule: string }) => l.rule)).toEqual(['12% of net value', '8% of net value · max ₹4,000']);
    expect(d.history.map((h: { action: string }) => h.action)).toEqual(
      expect.arrayContaining(['commission.adjusted', 'commission.approved', 'sale.recorded']),
    );
  });

  it('keeps the snapshot when a rule changes later', async () => {
    const plan = (await req('GET', '/admin/commission-plans', 'agent')).json().plans.find((p: { id: string }) => p.id === salonPlanId);
    const patchRule = plan.rules.find((r: { categoryId: string | null }) => r.categoryId === PATCH);
    const { id: _id, description: _d, ...ruleBody } = patchRule;
    expect((await req('PUT', `/admin/commission-plans/${salonPlanId}/rules/${patchRule.id}`, 'admin', { ...ruleBody, rateValue: 100 })).statusCode).toBe(204);
    // New sales use the new 1% rate...
    const fresh = await verifiedLead();
    const p = (await req('POST', `/admin/leads/${fresh.id}/sales/preview`, 'agent', sale([[PATCH, 25_000]]))).json();
    expect(p.totalPaise).toBe(25_000);
    // ...while the existing commission keeps the 12% it was calculated with.
    const d = (await req('GET', `/admin/commissions/${commissionId}`, 'agent')).json();
    expect(d.snapshot.lines[0].rule).toBe('12% of net value');
    expect(d.calculatedPaise).toBe(700_000);
  });

  it('reverses a returned sale and tells the partner', async () => {
    expect((await req('POST', `/admin/commissions/${commissionId}/reverse`, 'admin', { reason: 'no' })).statusCode).toBe(400);
    expect((await req('POST', `/admin/commissions/${commissionId}/reverse`, 'admin', { reason: 'Customer returned the wig within 7 days' })).statusCode).toBe(204);
    const mine = (await req('GET', `/partner/leads/${leadId}`, 'glow')).json();
    expect(mine.commission.label).toBe('Commission ₹6,500 reversed');
    expect(mine.timeline.at(-1).label).toBe('Sale returned');
    expect(JSON.stringify(mine)).not.toContain('returned the wig');
    expect((await req('POST', `/admin/commissions/${commissionId}/reject`, 'admin', { reason: 'Already reversed' })).statusCode).toBe(409);
  });

  it('auto-approves unflagged commissions only when the setting is on', async () => {
    expect((await req('PUT', '/admin/settings', 'agent', { auto_approve_unflagged: true })).statusCode).toBe(403);
    expect((await req('PUT', '/admin/settings', 'admin', { hold_days: -1 })).statusCode).toBe(400);
    expect((await req('PUT', '/admin/settings', 'admin', { auto_approve_unflagged: true, hold_days: 15 })).statusCode).toBe(204);
    const s = (await req('GET', '/admin/settings', 'agent')).json();
    expect(s.values).toMatchObject({ auto_approve_unflagged: true, hold_days: 15 });
    expect(s.defaults).toMatchObject({ auto_approve_unflagged: false, hold_days: 30 });

    const lead = await verifiedLead();
    const r = (await req('POST', `/admin/leads/${lead.id}/sales`, 'agent', sale([[WIG, 20_000]]))).json();
    expect(r.preview.holdUntil).toBe(new Date(Date.parse(`${today}T00:00:00Z`) + 15 * 86400_000).toISOString().slice(0, 10));
    await db.update(commissionEntries).set({ holdUntil: '2020-01-01' });
    const result = await money.advanceHolds();
    expect(result.autoApproved).toBe(1); // the flagged existing-customer commission stays for an admin
    const [entry] = await db.select().from(commissionEntries).where(eq(commissionEntries.id, r.commissionId));
    expect(entry!.status).toBe('approved');
    expect((await req('GET', `/admin/commissions/${r.commissionId}`, 'agent')).json().approvedBy).toBe('Automatic');
  });

  it('saves the matching referral benefit on new leads', async () => {
    const body = {
      name: 'Free home trial',
      type: 'waive_trial_fee',
      value: null,
      partnerTypeIds: [salonTypeId],
      customerText: 'Free home trial for Glow Studio clients',
      partnerText: 'Tell your client: their home trial is free',
    };
    expect((await req('POST', '/admin/benefits', 'agent', body)).statusCode).toBe(403);
    const id = (await req('POST', '/admin/benefits', 'admin', body)).json().id;
    expect((await req('GET', '/partner/lead-options', 'glow')).json().benefit).toEqual({
      partnerText: 'Tell your client: their home trial is free',
      customerText: 'Free home trial for Glow Studio clients',
    });
    await req('PATCH', `/admin/benefits/${id}`, 'admin', { priority: 5 });
    const [b] = (await req('GET', '/admin/benefits', 'agent')).json().items;
    expect(b).toMatchObject({ priority: 5, partnerTypeIds: [salonTypeId], active: true });
    await req('PATCH', `/admin/benefits/${id}`, 'admin', { active: false });
    expect((await req('GET', '/partner/lead-options', 'glow')).json().benefit).toBeNull();
  });

  it('records which plan was used even when a plan expires', async () => {
    await db.update(commissionPlans).set({ effectiveTo: '2026-01-02' }).where(eq(commissionPlans.id, salonPlanId));
    const lead = await verifiedLead();
    const p = (await req('POST', `/admin/leads/${lead.id}/sales/preview`, 'agent', sale([[WIG, 10_000]]))).json();
    expect(p.plan).toMatchObject({ name: 'Default plan', via: 'default' }); // the salon plan ended, so the default applies
    expect(p.totalPaise).toBe(0);
  });
});
