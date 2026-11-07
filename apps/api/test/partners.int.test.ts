/**
 * Partner onboarding against a real Postgres (migrations + seed), with a fake
 * token verifier and in-memory storage. Skipped unless TEST_DATABASE_URL is set.
 *
 *   TEST_DATABASE_URL=postgres://localhost:54329/hoc_test npm test -w @hoc/api
 *
 * The database is wiped first, so the URL must point at localhost.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adminUsers, auditLog, createDb, partners as partnersTable, type Db } from '@hoc/db';
import { seedDatabase } from '@hoc/db/seed';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app';
import { createFieldCipher } from '../src/lib/crypto';
import { createDbIdentityResolver } from '../src/lib/identity';
import { createOverviewQuery } from '../src/lib/overview';
import type { DocumentStorage } from '../src/lib/storage';
import type { TokenVerifier } from '../src/lib/token';
import { createConsoleSms } from '../src/lib/sms';
import { createLeadService } from '../src/services/leads';
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

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);
const PDF = Buffer.from('%PDF-1.7\n% fake pdf for tests\n');
const NOT_AN_IMAGE = Buffer.from('MZ this is not really a photo');

// token → who the fake verifier says it is
const tokens: Record<string, { sub: string; phone?: string; email?: string }> = {
  salon: { sub: randomUUID(), phone: '919876543210' },
  salon2: { sub: randomUUID(), phone: '919812345678' },
  emailOnly: { sub: randomUUID(), email: 'someone@example.com' },
  admin: { sub: randomUUID(), email: 'admin@ho.test' },
  agent: { sub: randomUUID(), email: 'agent@ho.test' },
};
const verifyToken: TokenVerifier = async (t) => {
  const u = tokens[t];
  if (!u) throw new Error('bad token');
  return { sub: u.sub, phone: u.phone ?? null, email: u.email ?? null };
};

const stored = new Map<string, { bytes: Buffer; contentType: string }>();
const memoryStorage: DocumentStorage = {
  async put(path, bytes, contentType) {
    if (stored.has(path)) throw new Error('exists');
    stored.set(path, { bytes, contentType });
  },
  async remove() {},
  async signedUrls(paths) {
    return new Map(paths.filter((p) => stored.has(p)).map((p) => [p, `https://storage.test/${p}?sig=1`]));
  },
};

let app: App;
let db: Db;
let closeDb: () => Promise<void>;

const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, token?: string, body?: unknown) =>
  app.inject({
    method,
    url: `/v1${path}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body !== undefined ? { payload: body as object } : {}),
  });

function upload(path: string, token: string, bytes: Buffer, fileName: string, contentType = 'image/jpeg') {
  const boundary = `----hoc${randomUUID()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url: `/v1${path}`,
    headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  });
}

const profile = (typeId: string, centreId: string, overrides: Record<string, unknown> = {}) => ({
  partnerTypeId: typeId,
  businessName: 'Glow Studio',
  ownerName: 'Priya Sharma',
  email: 'priya@example.com',
  addressLine: 'Shop 4, Main Market, Lajpat Nagar',
  city: 'New Delhi',
  state: 'Delhi',
  pincode: '110024',
  homeCentreId: centreId,
  ...overrides,
});

describe.skipIf(!url)('partner onboarding (Postgres)', () => {
  let options: {
    partnerTypes: { id: string; slug: string; documents: { id: string; slug: string }[] }[];
    centres: { id: string }[];
    terms: { version: string } | null;
  };
  const docId = (slug: string) => options.partnerTypes.find((t) => t.slug === 'salon')!.documents.find((d) => d.slug === slug)!.id;
  let salonId: string;

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

    app = await buildApp({
      corsOrigins: [],
      verifyToken,
      resolveIdentity: createDbIdentityResolver(db),
      getOverview: createOverviewQuery(db),
      partners: createPartnerService({ db, cipher: createFieldCipher(randomBytes(32).toString('base64')), storage: memoryStorage }),
      leads: createLeadService({ db, sms: createConsoleSms(() => {}), otpSecret: 'test', devCodes: true }),
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

  it('serves the registration options', async () => {
    const res = await req('GET', '/partner/registration-options', 'salon');
    expect(res.statusCode).toBe(200);
    options = res.json();
    expect(options.partnerTypes.map((t) => t.slug)).toEqual(['salon', 'parlour', 'freelancer', 'other']);
    expect(options.centres).toHaveLength(16);
    expect(options.terms?.version).toBe('0.1-draft');
    expect(options.partnerTypes[0]!.documents.map((d) => d.slug)).toContain('storefront_photo');
  });

  it('registers a draft partner for the logged-in phone number, once', async () => {
    const salon = options.partnerTypes.find((t) => t.slug === 'salon')!;
    const body = profile(salon.id, options.centres[0]!.id);

    expect((await req('POST', '/partner/register', 'emailOnly', body)).json().error.code).toBe('phone_required');
    expect((await req('POST', '/partner/register', 'admin', body)).statusCode).toBe(403);
    expect((await req('POST', '/partner/register', 'salon', { ...body, pincode: '12' })).json().error.message).toBe(
      'Enter a 6-digit pincode',
    );

    const res = await req('POST', '/partner/register', 'salon', body);
    expect(res.statusCode).toBe(201);
    const app1 = res.json();
    salonId = app1.id;
    expect(app1).toMatchObject({ status: 'draft', phone: '9876543210', businessName: 'Glow Studio', canEdit: true });
    expect(app1.blockers.map((b: { key: string }) => b.key)).toEqual(
      expect.arrayContaining(['pan', 'payout', 'document:storefront_photo', 'document:interior_photo']),
    );

    expect((await req('GET', '/me', 'salon')).json()).toMatchObject({ kind: 'partner', partnerStatus: 'draft' });
    expect((await req('POST', '/partner/register', 'salon', body)).statusCode).toBe(409);
  });

  it('encrypts PAN and payout details and only returns safe versions', async () => {
    const bad = await req('PATCH', '/partner/application', 'salon', { pan: 'ABC123' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.message).toBe('Enter a valid PAN, e.g. ABCDE1234F');

    const res = await req('PATCH', '/partner/application', 'salon', {
      pan: 'abcde1234f',
      payout: { method: 'upi', upiId: 'priya.salon@okhdfcbank' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ panLast4: '234F', payoutMethod: 'upi', payoutDisplay: 'UPI · pri•••@okhdfcbank' });

    const [row] = await db.select().from(partnersTable).where(eq(partnersTable.id, salonId));
    expect(row!.panEncrypted).toMatch(/^v1\./);
    expect(row!.panEncrypted).not.toContain('ABCDE1234F');
    expect(row!.payoutDetailsEncrypted).not.toContain('okhdfcbank');
  });

  it('checks uploads by their bytes, not their name', async () => {
    const renamed = await upload(`/partner/application/documents/${docId('storefront_photo')}`, 'salon', NOT_AN_IMAGE, 'shop.jpg');
    expect(renamed.statusCode).toBe(415);

    const wrongChecklist = options.partnerTypes.find((t) => t.slug === 'freelancer')!.documents.find((d) => d.slug === 'portfolio')!;
    expect((await upload(`/partner/application/documents/${wrongChecklist.id}`, 'salon', JPEG, 'a.jpg')).statusCode).toBe(400);

    const ok = await upload(`/partner/application/documents/${docId('storefront_photo')}`, 'salon', JPEG, '../../etc/shop front.jpg');
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ fileName: 'shop front.jpg', mimeType: 'image/jpeg', status: 'pending' });
    expect([...stored.keys()].some((k) => k.startsWith(`partners/${salonId}/storefront_photo/`))).toBe(true);
  });

  it('replaces a one-file document and limits multi-file ones', async () => {
    await upload(`/partner/application/documents/${docId('storefront_photo')}`, 'salon', PNG, 'better.png', 'image/png');
    const after = (await req('GET', '/partner/application', 'salon')).json();
    const storefront = after.checklist.find((c: { documentType: { slug: string } }) => c.documentType.slug === 'storefront_photo');
    expect(storefront.documents).toHaveLength(1);
    expect(storefront.documents[0].fileName).toBe('better.png');

    for (let i = 0; i < 3; i++) {
      expect((await upload(`/partner/application/documents/${docId('interior_photo')}`, 'salon', JPEG, `in${i}.jpg`)).statusCode).toBe(201);
    }
    const fourth = await upload(`/partner/application/documents/${docId('interior_photo')}`, 'salon', JPEG, 'in3.jpg');
    expect(fourth.statusCode).toBe(409);
    expect(fourth.json().error.code).toBe('too_many_files');
  });

  it('blocks submission until the checklist is complete and the current terms are accepted', async () => {
    const early = await req('POST', '/partner/application/submit', 'salon', { acceptTermsVersion: '0.1-draft' });
    expect(early.statusCode).toBe(400);
    expect(early.json().error.message).toContain('Upload your PAN card.');

    await upload(`/partner/application/documents/${docId('pan')}`, 'salon', PDF, 'pan.pdf', 'application/pdf');
    await upload(`/partner/application/documents/${docId('bank_proof')}`, 'salon', JPEG, 'cheque.jpg');

    expect((await req('POST', '/partner/application/submit', 'salon', { acceptTermsVersion: '0.0-old' })).json().error.code).toBe(
      'terms_changed',
    );

    const res = await req('POST', '/partner/application/submit', 'salon', { acceptTermsVersion: '0.1-draft' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'submitted', canEdit: false, agreementVersion: '0.1-draft', blockers: [] });

    expect((await req('PATCH', '/partner/application', 'salon', { city: 'Noida' })).json().error.code).toBe('not_editable');
    expect((await upload(`/partner/application/documents/${docId('gst')}`, 'salon', PDF, 'gst.pdf', 'application/pdf')).statusCode).toBe(409);
  });

  it('shows the queue to the HO team only', async () => {
    expect((await req('GET', '/admin/partners', 'salon')).statusCode).toBe(403);
    const list = (await req('GET', '/admin/partners?status=submitted', 'agent')).json();
    expect(list.total).toBe(1);
    expect(list.counts).toMatchObject({ submitted: 1, draft: 0, approved: 0 });
    expect(list.items[0]).toMatchObject({ id: salonId, businessName: 'Glow Studio', partnerType: 'Salon' });

    expect((await req('GET', '/admin/partners?q=lajpat', 'agent')).json().total).toBe(0); // address isn't searched
    expect((await req('GET', '/admin/partners?q=delhi', 'agent')).json().total).toBe(1);
    expect((await req('GET', '/admin/partners?q=98765', 'agent')).json().total).toBe(1);
  });

  it('sends an application back with notes, and the partner fixes and resubmits it', async () => {
    const detail = (await req('GET', `/admin/partners/${salonId}`, 'agent')).json();
    expect(detail.approvalBlockers[0].key).toBe('pending');
    const docs = detail.checklist.flatMap((c: { documents: { id: string; viewUrl: string }[] }) => c.documents);
    expect(docs).toHaveLength(6);
    expect(docs.every((d: { viewUrl: string | null }) => d.viewUrl?.startsWith('https://storage.test/'))).toBe(true);

    expect((await req('POST', `/admin/partners/${salonId}/decision`, 'agent', { action: 'approve' })).json().error.code).toBe(
      'not_ready',
    );

    const storefront = detail.checklist.find((c: { documentType: { slug: string } }) => c.documentType.slug === 'storefront_photo')
      .documents[0];
    expect(
      (await req('PATCH', `/admin/partners/${salonId}/documents/${storefront.id}`, 'agent', { status: 'rejected' })).statusCode,
    ).toBe(400); // a note is required
    expect(
      (
        await req('PATCH', `/admin/partners/${salonId}/documents/${storefront.id}`, 'agent', {
          status: 'rejected',
          note: 'Name board not visible',
        })
      ).statusCode,
    ).toBe(204);

    const sentBack = await req('POST', `/admin/partners/${salonId}/decision`, 'agent', {
      action: 'request_changes',
      note: 'Please upload a storefront photo where the name board is visible.',
    });
    expect(sentBack.json()).toMatchObject({ status: 'changes_requested' });

    const mine = (await req('GET', '/partner/application', 'salon')).json();
    expect(mine).toMatchObject({ status: 'changes_requested', canEdit: true });
    expect(mine.reviewNote).toContain('name board');
    expect(mine.blockers).toEqual([{ key: 'document:storefront_photo', message: 'Replace your Storefront photo: it was not accepted.' }]);

    await upload(`/partner/application/documents/${docId('storefront_photo')}`, 'salon', JPEG, 'storefront-new.jpg');
    const resubmitted = await req('POST', '/partner/application/submit', 'salon', { acceptTermsVersion: '0.1-draft' });
    expect(resubmitted.json()).toMatchObject({ status: 'submitted', reviewNote: null });
  });

  it('approves once every required document is accepted, and issues a partner code', async () => {
    const detail = (await req('GET', `/admin/partners/${salonId}`, 'agent')).json();
    for (const c of detail.checklist) {
      for (const d of c.documents) {
        if (d.status === 'pending') {
          await req('PATCH', `/admin/partners/${salonId}/documents/${d.id}`, 'agent', { status: 'accepted' });
        }
      }
    }
    const approved = await req('POST', `/admin/partners/${salonId}/decision`, 'agent', { action: 'approve' });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toEqual({ status: 'approved', code: 'HOC00001' });
    expect((await req('GET', '/me', 'salon')).json()).toMatchObject({ partnerStatus: 'approved' });
    expect((await req('GET', '/partner/application', 'salon')).json()).toMatchObject({ code: 'HOC00001', canEdit: false });

    // a second approval can't run on the same application
    expect((await req('POST', `/admin/partners/${salonId}/decision`, 'agent', { action: 'approve' })).statusCode).toBe(409);
  });

  it('numbers partner codes in order', async () => {
    const parlour = options.partnerTypes.find((t) => t.slug === 'parlour')!;
    const created = await req('POST', '/partner/register', 'salon2', profile(parlour.id, options.centres[1]!.id, { businessName: 'Rani Parlour' }));
    const id = created.json().id;
    await req('PATCH', '/partner/application', 'salon2', {
      pan: 'PQRST6789K',
      payout: { method: 'bank', accountHolder: 'Rani K', accountNumber: '123456789012', ifsc: 'SBIN0001234' },
    });
    for (const d of parlour.documents.filter((x) => ['storefront_photo', 'interior_photo', 'pan', 'bank_proof'].includes(x.slug))) {
      await upload(`/partner/application/documents/${d.id}`, 'salon2', JPEG, `${d.slug}.jpg`);
    }
    await req('POST', '/partner/application/submit', 'salon2', { acceptTermsVersion: '0.1-draft' });
    const detail = (await req('GET', `/admin/partners/${id}`, 'admin')).json();
    for (const c of detail.checklist) for (const d of c.documents) await req('PATCH', `/admin/partners/${id}/documents/${d.id}`, 'admin', { status: 'accepted' });
    expect((await req('POST', `/admin/partners/${id}/decision`, 'admin', { action: 'approve' })).json().code).toBe('HOC00002');
  });

  it('reveals full PAN and payout to the HO team, and audits it', async () => {
    const res = await req('GET', `/admin/partners/${salonId}/sensitive`, 'agent');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toEqual({ pan: 'ABCDE1234F', payout: { method: 'upi', upiId: 'priya.salon@okhdfcbank' } });
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'partner.sensitive_viewed'));
    expect(rows).toHaveLength(1);
    expect((await req('GET', `/admin/partners/${salonId}/sensitive`, 'salon')).statusCode).toBe(403);
  });

  it('lets only admins suspend and reactivate', async () => {
    const suspendBody = { action: 'suspend', note: 'Customer complaints under review' };
    expect((await req('POST', `/admin/partners/${salonId}/decision`, 'agent', suspendBody)).statusCode).toBe(403);
    expect((await req('POST', `/admin/partners/${salonId}/decision`, 'admin', suspendBody)).json().status).toBe('suspended');
    expect((await req('POST', `/admin/partners/${salonId}/decision`, 'admin', { action: 'reactivate' })).json()).toEqual({
      status: 'approved',
      code: 'HOC00001',
    });
  });

  it('keeps a readable history of the application', async () => {
    const { history } = (await req('GET', `/admin/partners/${salonId}`, 'admin')).json();
    const actions = history.map((h: { action: string }) => h.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'partner.registered',
        'partner.submitted',
        'document.rejected',
        'partner.request_changes',
        'partner.resubmitted',
        'partner.approve',
        'partner.suspend',
        'partner.reactivate',
      ]),
    );
    expect(history.find((h: { action: string }) => h.action === 'partner.request_changes')).toMatchObject({ actor: 'Ravi Agent' });
    expect(history.find((h: { action: string }) => h.action === 'partner.submitted')).toMatchObject({ actor: 'Partner' });
  });

  it('lets admins (not agents) edit partner types and checklists', async () => {
    expect((await req('POST', '/admin/partner-types', 'agent', { name: 'Spa' })).statusCode).toBe(403);
    const created = await req('POST', '/admin/partner-types', 'admin', { name: 'Spa & Wellness' });
    expect(created.statusCode).toBe(201);
    const typeId = created.json().id;

    const doc = await req('POST', `/admin/partner-types/${typeId}/document-types`, 'admin', { name: 'Shop photo', maxFiles: 2 });
    expect(doc.statusCode).toBe(201);
    expect((await req('PATCH', `/admin/document-types/${doc.json().id}`, 'admin', { name: 'Shop front photo' })).statusCode).toBe(204);

    const { items } = (await req('GET', '/admin/partner-types', 'agent')).json();
    const spa = items.find((t: { id: string }) => t.id === typeId);
    expect(spa).toMatchObject({ slug: 'spa_wellness', partnerCount: 0 });
    expect(spa.documents[0]).toMatchObject({ name: 'Shop front photo', maxFiles: 2, required: true }); // untouched fields kept

    expect((await req('POST', '/admin/partner-types', 'admin', { name: 'Spa & Wellness' })).statusCode).toBe(409);

    const salonType = items.find((t: { slug: string }) => t.slug === 'salon');
    expect(salonType.partnerCount).toBe(1);
    await req('PATCH', `/admin/partner-types/${typeId}`, 'admin', { active: false });
    const opts = (await req('GET', '/partner/registration-options', 'salon')).json();
    expect(opts.partnerTypes.map((t: { slug: string }) => t.slug)).not.toContain('spa_wellness');
  });

  it('counts partners on the dashboard overview', async () => {
    expect((await req('GET', '/admin/overview', 'agent')).json().partners).toEqual({ total: 2, awaitingReview: 0, approved: 2, deletionRequests: 0 });
  });
});
