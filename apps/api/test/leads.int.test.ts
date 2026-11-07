/**
 * Leads against a real Postgres: add lead → consent OTP → verification → stages → bulk updates.
 * Skipped unless TEST_DATABASE_URL is set (see partners.int.test.ts). Wipes the database.
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  adminUsers,
  consentRecords,
  createDb,
  leads as leadsTable,
  messageLog,
  partnerTypes,
  partnerUsers,
  partners,
  productCategories,
  centres,
  settings,
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
import type { SmsSender } from '../src/lib/sms';
import type { TokenVerifier } from '../src/lib/token';
import { createLeadService, type LeadService } from '../src/services/leads';
import { createCommissionService } from '../src/services/commissions';
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
  rani: { sub: randomUUID(), phone: '919822222222' },
  pending: { sub: randomUUID(), phone: '919833333333' },
  agent: { sub: randomUUID(), email: 'agent@ho.test' },
};
const verifyToken: TokenVerifier = async (t) => {
  const u = tokens[t];
  if (!u) throw new Error('bad token');
  return { sub: u.sub, phone: u.phone ?? null, email: u.email ?? null };
};

const sent: { to: string; body: string; templateId: string | null }[] = [];
const fakeSms: SmsSender = {
  name: 'nimbus', // so the API never returns dev codes: the test reads them from the "SMS"
  async send(m) {
    sent.push({ to: m.to, body: m.body, templateId: m.providerTemplateId });
    return { ok: true, providerRef: `sms-${sent.length}` };
  },
};
const lastCode = (to: string) => {
  const msg = [...sent].reverse().find((m) => m.to === to);
  return /\b(\d{6})\b/.exec(msg?.body ?? '')?.[1] ?? '';
};

let app: App;
let db: Db;
let leadService: LeadService;
let closeDb: () => Promise<void>;
let categoryIds: string[] = [];
let centreId = '';

const req = (method: 'GET' | 'POST', path: string, token?: string, body?: unknown) =>
  app.inject({
    method,
    url: `/v1${path}`,
    headers: token ? { authorization: `Bearer ${token}`, 'user-agent': 'vitest' } : {},
    ...(body !== undefined ? { payload: body as object } : {}),
  });

const newLead = (overrides: Record<string, unknown> = {}) => ({
  customerName: 'meera kapoor',
  customerPhone: '+91 99999 00001',
  categoryIds: [categoryIds[0]],
  city: 'New Delhi',
  pincode: '110024',
  preferredMode: 'ec_visit',
  preferredCentreId: centreId,
  notes: 'Thinning at the crown, prefers weekends',
  ...overrides,
});

describe.skipIf(!url)('leads (Postgres)', () => {
  beforeAll(async () => {
    const conn = createDb(url!, { max: 4 });
    db = conn.db;
    closeDb = () => conn.sql.end({ timeout: 2 });
    await conn.sql.unsafe('drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;');
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)) });
    await seedDatabase(db);
    await db.insert(adminUsers).values({ authUserId: tokens.agent!.sub, email: 'agent@ho.test', name: 'Ravi Agent', role: 'agent' });

    const [salon] = await db.select().from(partnerTypes).where(eq(partnerTypes.slug, 'salon'));
    const make = async (token: string, name: string, status: 'approved' | 'submitted', code: string | null) => {
      const phone = tokens[token]!.phone!.slice(2);
      const [p] = await db
        .insert(partners)
        .values({ partnerTypeId: salon!.id, businessName: name, ownerName: name, phone, status, code, city: 'New Delhi' })
        .returning();
      await db.insert(partnerUsers).values({ partnerId: p!.id, authUserId: tokens[token]!.sub, phone });
      return p!;
    };
    await make('glow', 'Glow Studio', 'approved', 'HOC00001');
    await make('rani', 'Rani Parlour', 'approved', 'HOC00002');
    await make('pending', 'New Salon', 'submitted', null);

    categoryIds = (await db.select({ id: productCategories.id }).from(productCategories)).map((c) => c.id);
    centreId = (await db.select({ id: centres.id }).from(centres).limit(1))[0]!.id;

    leadService = createLeadService({ db, sms: fakeSms, otpSecret: 'test-secret', devCodes: false });
    app = await buildApp({
      corsOrigins: [],
      verifyToken,
      resolveIdentity: createDbIdentityResolver(db),
      getOverview: createOverviewQuery(db),
      partners: createPartnerService({ db, cipher: createFieldCipher(Buffer.alloc(32, 1).toString('base64')), storage: {} as never }),
      leads: leadService,
      commissions: createCommissionService({ db }),
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

  let leadId = '';

  it('is only for approved partners', async () => {
    expect((await req('GET', '/partner/lead-options', 'pending')).json().error.code).toBe('partner_not_approved');
    expect((await req('GET', '/partner/lead-options', 'agent')).statusCode).toBe(403);
    const opts = (await req('GET', '/partner/lead-options', 'glow')).json();
    expect(opts).toMatchObject({ requireOtp: true, dailyLimit: 20, addedToday: 0, benefit: null });
    expect(opts.categories.length).toBeGreaterThan(0);
  });

  it('validates the lead and refuses the partner’s own number', async () => {
    expect((await req('POST', '/partner/leads', 'glow', newLead({ customerPhone: '12345' }))).json().error.message).toBe(
      'Enter a valid 10-digit mobile number',
    );
    expect((await req('POST', '/partner/leads', 'glow', newLead({ preferredCentreId: null }))).json().error.message).toBe(
      'Choose the experience centre',
    );
    expect((await req('POST', '/partner/leads', 'glow', newLead({ customerPhone: '9811111111' }))).json().error.code).toBe('own_number');
  });

  it('creates the lead and sends the consent SMS, storing only a hash of the code', async () => {
    const res = await req('POST', '/partner/leads', 'glow', newLead());
    expect(res.statusCode).toBe(201);
    const body = res.json();
    leadId = body.lead.id;
    expect(body).toMatchObject({ smsSent: true });
    expect(body.devCode).toBeUndefined();
    expect(body.lead).toMatchObject({
      ref: 'L-000001',
      customerName: 'Meera K.',
      customerPhone: '99XXXXX001',
      stage: 'awaiting_consent',
      stageLabel: 'Waiting for customer confirmation',
      customerTypeLabel: null,
      consent: { pending: true, canResend: true, resendsLeft: 1 },
    });
    expect(JSON.stringify(body)).not.toContain('Thinning'); // partner notes stay in the dashboard

    const sms = sent.at(-1)!;
    expect(sms.to).toBe('9999900001');
    expect(sms.body).toMatch(/^\d{6} is your OTP to confirm your referral to HairOriginals by Glow Studio\. Valid for 72 hours/);
    const [rec] = await db.select().from(consentRecords).where(eq(consentRecords.leadId, leadId));
    expect(rec!.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec!.otpHash).not.toContain(lastCode('9999900001'));
    expect(rec!.consentTextVersion).toBe('0.1-draft');
    expect((await db.select().from(messageLog)).at(-1)).toMatchObject({ status: 'sent', templateKey: 'consent_otp', providerRef: 'sms-1' });
  });

  it('stops the same partner referring the same customer twice', async () => {
    const again = await req('POST', '/partner/leads', 'glow', newLead());
    expect(again.statusCode).toBe(409);
    expect(again.json().error.message).toBe('You already referred this customer (L-000001).');
  });

  it('counts wrong codes, limits resends, and confirms with the latest code', async () => {
    const wrong = await req('POST', `/partner/leads/${leadId}/confirm`, 'glow', { code: '000000' === lastCode('9999900001') ? '111111' : '000000' });
    expect(wrong.json().error.message).toBe('That code is wrong. 4 tries left.');

    expect((await req('POST', `/partner/leads/${leadId}/resend`, 'glow')).json().error.code).toBe('too_soon');
    const oldCode = lastCode('9999900001');
    await db.update(consentRecords).set({ createdAt: new Date(Date.now() - 120_000) }).where(eq(consentRecords.leadId, leadId));
    expect((await req('POST', `/partner/leads/${leadId}/resend`, 'glow')).json()).toEqual({ smsSent: true });
    const newCode = lastCode('9999900001');
    expect(newCode).not.toBe(oldCode);

    await db.update(consentRecords).set({ createdAt: new Date(Date.now() - 120_000) }).where(eq(consentRecords.leadId, leadId));
    expect((await req('POST', `/partner/leads/${leadId}/resend`, 'glow')).json().error.code).toBe('resend_limit');

    if (oldCode !== newCode) {
      expect((await req('POST', `/partner/leads/${leadId}/confirm`, 'glow', { code: oldCode })).statusCode).toBe(400);
    }
    const ok = await req('POST', `/partner/leads/${leadId}/confirm`, 'glow', { code: newCode });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ stage: 'under_review', stageLabel: 'Confirmed – HO is reviewing', consent: { pending: false } });
    const owned = new Date(ok.json().ownedUntil).getTime() - Date.now();
    expect(Math.round(owned / 86400_000)).toBe(90);

    const [rec] = await db.select().from(consentRecords).where(eq(consentRecords.leadId, leadId)).orderBy(consentRecords.createdAt);
    expect(rec).toBeDefined();
    const verified = (await db.select().from(consentRecords).where(eq(consentRecords.leadId, leadId))).find((r) => r.verifiedAt);
    expect(verified).toMatchObject({ userAgent: 'vitest' });
  });

  it('locks out after five wrong codes', async () => {
    const created = (await req('POST', '/partner/leads', 'glow', newLead({ customerName: 'Arjun', customerPhone: '9999900002' }))).json();
    const id = created.lead.id;
    const code = lastCode('9999900002');
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) await req('POST', `/partner/leads/${id}/confirm`, 'glow', { code: wrong });
    const locked = await req('POST', `/partner/leads/${id}/confirm`, 'glow', { code });
    expect(locked.json().error.code).toBe('too_many_attempts');
  });

  it('gives the customer to whoever gets consent first', async () => {
    // Rani adds the same customer as Arjun (Glow's lead is still unconfirmed), and confirms first.
    const rani = (await req('POST', '/partner/leads', 'rani', newLead({ customerName: 'Arjun', customerPhone: '9999900002' }))).json();
    const raniOk = await req('POST', `/partner/leads/${rani.lead.id}/confirm`, 'rani', { code: lastCode('9999900002') });
    expect(raniOk.json().stage).toBe('under_review');

    // Glow can't add the customer Rani now owns...
    expect((await req('POST', '/partner/leads', 'glow', newLead({ customerPhone: '9999900002' }))).json().error.code).toBe('already_referred_by_you');
    const third = await req('POST', '/partner/leads', 'glow', newLead({ customerName: 'Arjun', customerPhone: '9999900003' }));
    expect(third.statusCode).toBe(201);
    expect((await req('POST', '/partner/leads', 'rani', newLead({ customerPhone: '9999900001' }))).json().error.code).toBe('already_referred');

    // ...and a later confirmation of the same customer becomes "Already referred".
    const late = (await req('POST', '/partner/leads', 'rani', newLead({ customerName: 'Late', customerPhone: '9999900004' }))).json();
    const glowLate = (await req('POST', '/partner/leads', 'glow', newLead({ customerName: 'Late', customerPhone: '9999900004' }))).json();
    const codeForGlow = lastCode('9999900004');
    await req('POST', `/partner/leads/${glowLate.lead.id}/confirm`, 'glow', { code: codeForGlow });
    await db.update(consentRecords).set({ createdAt: new Date(Date.now() - 120_000) }).where(eq(consentRecords.leadId, late.lead.id));
    await req('POST', `/partner/leads/${late.lead.id}/resend`, 'rani');
    const dup = await req('POST', `/partner/leads/${late.lead.id}/confirm`, 'rani', { code: lastCode('9999900004') });
    expect(dup.json()).toMatchObject({ stage: 'duplicate', stageLabel: 'Already referred', ownedUntil: null });
  });

  it('enforces the daily limit from settings', async () => {
    const { addedToday } = (await req('GET', '/partner/lead-options', 'glow')).json();
    expect(addedToday).toBe(4);
    await db.insert(settings).values({ key: 'max_leads_per_partner_per_day', value: addedToday });
    const res = await req('POST', '/partner/leads', 'glow', newLead({ customerPhone: '9999900009' }));
    expect(res.statusCode).toBe(429);
    expect(res.json().error.message).toBe('You can add up to 4 leads a day. Try again tomorrow.');
    await db.delete(settings).where(eq(settings.key, 'max_leads_per_partner_per_day'));
  });

  it('skips the OTP when consent is switched off in settings', async () => {
    await db.insert(settings).values({ key: 'require_customer_otp', value: false });
    const before = sent.length;
    const res = (await req('POST', '/partner/leads', 'rani', newLead({ customerName: 'No Otp', customerPhone: '9999900010' }))).json();
    expect(res).toMatchObject({ smsSent: false, lead: { stage: 'under_review' } });
    expect(sent.length).toBe(before);
    await db.delete(settings).where(eq(settings.key, 'require_customer_otp'));
  });

  it('puts confirmed leads in the verification queue, oldest first', async () => {
    const list = (await req('GET', '/admin/leads?view=verify', 'agent')).json();
    expect(list.items.map((l: { ref: string }) => l.ref)).toEqual(['L-000001', 'L-000003', 'L-000006', 'L-000007']);
    expect(list.counts).toMatchObject({ verify: 4, awaiting: 2, closed: 1 });
    expect(list.items[0]).toMatchObject({ customerName: 'meera kapoor', customerPhone: '9999900001', partner: { name: 'Glow Studio' } });
    expect((await req('GET', '/admin/leads?view=all&q=L-000002', 'agent')).json().items).toHaveLength(1);
    expect((await req('GET', '/admin/leads?view=all&q=99999 00004', 'agent')).json().total).toBe(2);
    expect((await req('GET', '/admin/leads?view=verify', 'glow')).statusCode).toBe(403);
  });

  it('tags the customer type, and partners only ever see the neutral label', async () => {
    const res = await req('POST', `/admin/leads/${leadId}/verify`, 'agent', { customerType: 'existing_customer', crmRef: 'DC-4471', note: 'Bought a patch in 2024' });
    expect(res.statusCode).toBe(204);
    const mine = (await req('GET', `/partner/leads/${leadId}`, 'glow')).json();
    expect(mine).toMatchObject({ stage: 'verified', customerTypeLabel: 'Already connected with HO' });
    const text = JSON.stringify(mine);
    expect(text).not.toContain('existing_customer');
    expect(text).not.toContain('Bought a patch');
    expect(text).not.toContain('DC-4471');

    const detail = (await req('GET', `/admin/leads/${leadId}`, 'agent')).json();
    expect(detail).toMatchObject({ customerType: 'existing_customer', crmRef: 'DC-4471', verifiedBy: 'Ravi Agent', notes: 'Thinning at the crown, prefers weekends' });
    expect(detail.consents).toHaveLength(2);
    expect(detail.events.find((e: { type: string }) => e.type === 'verified').note).toBe('Bought a patch in 2024');
  });

  it('moves stages by hand with the shared rules, and shows partners the booking but not the notes', async () => {
    expect((await req('POST', `/admin/leads/${leadId}/stage`, 'agent', { stage: 'purchased' })).statusCode).toBe(400);
    expect((await req('POST', `/admin/leads/${leadId}/stage`, 'agent', { stage: 'consultation_booked' })).json().error.code).toBe(
      'invalid_stage_change',
    );
    const booked = await req('POST', `/admin/leads/${leadId}/stage`, 'agent', {
      stage: 'consultation_booked',
      consultationMode: 'home_trial',
      consultationAt: '2026-11-20T16:30:00+05:30',
      note: 'Customer asked for evening slot',
    });
    expect(booked.json()).toEqual({ changed: true });
    expect((await req('POST', `/admin/leads/${leadId}/notes`, 'agent', { note: 'Internal only: VIP' })).statusCode).toBe(204);

    const mine = (await req('GET', `/partner/leads/${leadId}`, 'glow')).json();
    expect(mine.consultation).toMatchObject({ mode: 'home_trial', modeLabel: 'Home trial', at: '2026-11-20T11:00:00.000Z' });
    expect(mine.timeline.map((t: { label: string }) => t.label)).toEqual([
      'Lead added',
      'Confirmation code sent to the customer',
      'Confirmation code sent again',
      'Customer confirmed',
      'Already connected with HO',
      'Consultation booked',
    ]);
    expect(mine.timeline.at(-1).detail).toBe('Home trial · 20 Nov, 4:30 pm');
    expect(JSON.stringify(mine)).not.toMatch(/evening slot|VIP|Ravi/);
  });

  it('applies a bulk update to a selection and reports each lead', async () => {
    const queue = (await req('GET', '/admin/leads?view=verify', 'agent')).json();
    for (const l of queue.items) await req('POST', `/admin/leads/${l.id}/verify`, 'agent', { customerType: 'new' });
    const open = (await req('GET', '/admin/leads?view=open', 'agent')).json().items.map((l: { id: string }) => l.id);
    const awaiting = (await req('GET', '/admin/leads?view=awaiting', 'agent')).json().items[0].id;

    const job = (await req('POST', '/admin/leads/bulk-stage', 'agent', { leadIds: [...open, awaiting], stage: 'in_touch' })).json();
    expect(job.status).toBe('applied');
    expect(job.appliedRows).toBe(open.length);
    expect(job.rows.find((r: { leadId: string }) => r.leadId === awaiting)).toMatchObject({ outcome: 'skipped' });
  });

  it('previews a CSV row by row, then applies only the valid rows, once', async () => {
    const csv = [
      'lead_ref,phone,stage,consultation_mode,consultation_at,note',
      'L-000001,,consultation_done,,,Trial went well',
      ',99999 00010,consultation_booked,ec_visit,20/11/2026 17:00,"Booked, Lajpat Nagar"',
      'L-000002,,in_touch,,,', // awaiting consent: can't be moved by hand
      'L-999999,,in_touch,,,',
      ',9999900001,in_touch,,,', // same lead as the first row
      'L-000006,,in touch,,,', // already in_touch → no change
      'L-000003,,teleported,,,',
    ].join('\r\n');
    const preview = await req('POST', '/admin/leads/bulk-csv/preview', 'agent', { csv, fileName: 'today.csv' });
    expect(preview.statusCode).toBe(200);
    const job = preview.json();
    expect(job.rows.map((r: { outcome: string }) => r.outcome)).toEqual(['valid', 'valid', 'invalid', 'invalid', 'invalid', 'no_change', 'invalid']);
    expect(job.rows[3].reason).toBe('No lead L-999999');
    expect(job.rows[4].reason).toBe('This lead appears more than once in the file');
    expect(job.rows[6].reason).toContain("can't be set by hand");

    // nothing changed yet
    expect((await db.select().from(leadsTable).where(eq(leadsTable.number, 1)))[0]!.stage).toBe('in_touch');

    const applied = (await req('POST', `/admin/bulk-jobs/${job.id}/apply`, 'agent')).json();
    expect(applied).toMatchObject({ status: 'applied', appliedRows: 2 });
    const [l1] = await db.select().from(leadsTable).where(eq(leadsTable.number, 1));
    const [l7] = await db.select().from(leadsTable).where(eq(leadsTable.number, 7)); // the no-OTP lead
    expect(l1!.stage).toBe('consultation_done');
    expect(l7).toMatchObject({ stage: 'consultation_booked', consultationMode: 'ec_visit' });
    expect(l7!.consultationAt!.toISOString()).toBe('2026-11-20T11:30:00.000Z');

    expect((await req('POST', `/admin/bulk-jobs/${job.id}/apply`, 'agent')).json().error.code).toBe('already_applied');
    expect((await req('POST', '/admin/leads/bulk-csv/preview', 'agent', { csv: 'name,city\nA,B' })).json().error.code).toBe('bad_csv');
  });

  it('expires leads the customer never confirmed', async () => {
    const pending = await db.select().from(leadsTable).where(eq(leadsTable.stage, 'awaiting_consent'));
    expect(pending.length).toBeGreaterThan(0);
    await db.update(leadsTable).set({ consentExpiresAt: new Date(Date.now() - 1000) }).where(eq(leadsTable.stage, 'awaiting_consent'));
    expect(await leadService.expireDue()).toBe(pending.length);
    const [l2] = await db.select().from(leadsTable).where(eq(leadsTable.number, 2)); // Glow's locked-out lead
    expect((await req('GET', `/partner/leads/${l2!.id}`, 'glow')).json()).toMatchObject({
      stage: 'consent_expired',
      stageLabel: 'Customer did not confirm',
      timeline: expect.arrayContaining([expect.objectContaining({ label: 'Customer did not confirm' })]),
    });
  });

  it('lists a partner’s own leads with counts, and nobody else’s', async () => {
    const list = (await req('GET', '/partner/leads', 'glow')).json();
    expect(list.counts.all).toBe(list.items.length);
    expect(list.items.every((l: { customerPhone: string }) => /^\d{2}X{5}\d{3}$/.test(l.customerPhone))).toBe(true);
    const raniLead = (await req('GET', '/partner/leads', 'rani')).json().items[0].id;
    expect((await req('GET', `/partner/leads/${raniLead}`, 'glow')).statusCode).toBe(404);
    expect((await req('GET', '/admin/overview', 'agent')).json().leads).toMatchObject({ toVerify: 0 });
  });
});
