/**
 * Reports, pilot metrics, audit log, team management and the privacy actions, against a real Postgres.
 * Skipped unless TEST_DATABASE_URL is set. Wipes the database.
 */
import { leads as leadsTable, partnerDocuments, partnerUsers, partners as partnersTable, pushTokens } from '@hoc/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addAdmins, addPartner, categories, createWorld, newToken, testDatabaseUrl, verifiedLead, type Tokens } from './helpers';

const url = testDatabaseUrl();
const tokens: Tokens = {
  admin: newToken({ email: 'admin@ho.test' }),
  agent: newToken({ email: 'agent@ho.test' }),
  second: newToken({ email: 'second@ho.test' }),
  glow: newToken({ phone: '919811111111' }),
  rani: newToken({ phone: '919822222222' }),
  stranger: newToken({ phone: '919877777777' }),
};

let w: Awaited<ReturnType<typeof createWorld>>;
let glowId = '';
let raniId = '';
let CAT = '';
const ids: Record<string, string> = {};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

describe.skipIf(!url)('reports, audit, team and privacy (Postgres)', () => {
  beforeAll(async () => {
    w = await createWorld({ url: url!, tokens });
    await addAdmins(w.db, tokens);
    glowId = (await addPartner(w.db, { token: tokens.glow, name: 'Glow Studio', phone: '9811111111', code: 'HOC00001' })).partner.id;
    raniId = (await addPartner(w.db, { token: tokens.rani, name: 'Rani Parlour', phone: '9822222222', code: 'HOC00002', city: 'Gurugram' })).partner.id;
    CAT = (await categories(w.db))[0]!.id;

    const plan = (await w.req('GET', '/admin/commission-plans', 'agent')).json().plans[0];
    const rule = plan.rules.find((r: { customerType: string | null }) => r.customerType === 'new');
    const { id: _i, description: _d, ...body } = rule;
    await w.req('PUT', `/admin/commission-plans/${plan.id}/rules/${rule.id}`, 'admin', { ...body, rateValue: 1000 });

    const base = { stage: 'verified' as const, customerType: 'new' as const, consentConfirmedAt: hoursAgo(5), verifiedAt: hoursAgo(2) };
    ids.l1 = (await verifiedLead(w.db, glowId, { ...base, city: 'new delhi', customerName: 'First Customer' })).id;
    ids.l2 = (await verifiedLead(w.db, glowId, { ...base, city: 'New Delhi ', customerName: 'Second Customer' })).id;
    ids.l3 = (await verifiedLead(w.db, glowId, { stage: 'awaiting_consent', consentStatus: 'pending', customerType: null, consentConfirmedAt: null, ownedUntil: null, city: null, customerName: 'Third Customer' })).id;
    ids.l4 = (await verifiedLead(w.db, raniId, { stage: 'under_review', customerType: null, verifiedAt: null, consentConfirmedAt: hoursAgo(30), city: 'Gurugram', customerName: 'Fourth Customer' })).id;

    // Walk lead 1 through the pipeline by hand so the events exist, then record its sale.
    for (const body of [{ stage: 'in_touch' }, { stage: 'consultation_booked', consultationMode: 'ec_visit' }, { stage: 'consultation_done' }]) {
      expect((await w.req('POST', `/admin/leads/${ids.l1}/stage`, 'agent', body)).statusCode).toBe(200);
    }
    const sale = await w.req('POST', `/admin/leads/${ids.l1}/sales`, 'agent', { saleDate: today, lines: [{ categoryId: CAT, netPaise: 1_000_000 }] });
    expect(sale.statusCode).toBe(201);
    ids.commission = sale.json().commissionId;
  });
  afterAll(async () => {
    await w?.close();
  });

  it('reports the funnel by partner, city and preferred centre, for agents too', async () => {
    const r = (await w.req('GET', '/admin/reports/funnel?by=partner', 'agent')).json();
    expect(r.rows.map((x: { label: string }) => x.label)).toEqual(['Glow Studio', 'Rani Parlour']); // most purchases first
    expect(r.rows[0]).toMatchObject({ added: 3, confirmed: 2, verified: 2, booked: 1, consulted: 1, purchased: 1, commissionPaise: 100_000 });
    expect(r.rows[1]).toMatchObject({ added: 1, confirmed: 1, verified: 0, purchased: 0, commissionPaise: 0 });
    expect(r.totals).toMatchObject({ added: 4, confirmed: 3, verified: 2, purchased: 1 });

    const city = (await w.req('GET', '/admin/reports/funnel?by=city', 'agent')).json();
    expect(Object.fromEntries(city.rows.map((x: { label: string; added: number }) => [x.label, x.added]))).toEqual({ 'New Delhi': 2, Gurugram: 1, 'Not given': 1 });
    const centre = (await w.req('GET', '/admin/reports/funnel?by=centre', 'agent')).json();
    expect(centre.rows).toMatchObject([{ label: 'No preference', added: 4 }]);
  });

  it('respects the date range and rejects bad dates', async () => {
    const tomorrow = new Date(Date.now() + 5.5 * 3600_000 + 86400_000).toISOString().slice(0, 10);
    const empty = (await w.req('GET', `/admin/reports/funnel?from=${tomorrow}&to=${tomorrow}`, 'agent')).json();
    expect(empty.rows).toEqual([]);
    expect(empty.totals.added).toBe(0);
    const day = (await w.req('GET', `/admin/reports/funnel?from=${today}&to=${today}`, 'agent')).json();
    expect(day.totals.added).toBe(4);
    expect((await w.req('GET', '/admin/reports/funnel?from=yesterday', 'agent')).statusCode).toBe(400);
    expect((await w.req('GET', '/admin/reports/funnel', 'glow')).statusCode).toBe(403);
  });

  it('computes the pilot metrics', async () => {
    const m = (await w.req('GET', '/admin/reports/metrics', 'agent')).json();
    expect(m.partners).toEqual({ approved: 2, active: 2 });
    expect(m.leads).toMatchObject({ added: 4, confirmed: 3, consentRate: 0.75, verified: 2, newCustomers: 2, alreadyConnected: 0, newShare: 1, purchased: 1, purchaseConversion: 0.5 });
    expect(m.leads.perActivePartnerPerWeek).toBeCloseTo(4 / 2 / (30 / 7), 1);
    expect(m.speed.waitingNow).toBe(1);
    expect(m.speed.oldestWaitingHours).toBeCloseTo(30, 0);
    expect(m.speed.verifyWaitHours).toMatchObject({ avg: 3, median: 3, p90: 3 });
    expect(m.speed.firstContactHours.avg).toBeCloseTo(5, 0); // consent 5 hours ago, "in touch" just now
    expect(m.money).toMatchObject({ commissions: 1, totalCommissionPaise: 100_000, avgCommissionPaise: 100_000, paidOutPaise: 0, avgDaysSaleToPayout: null });
    expect(m.money.byStatus.pending).toBe(100_000);
    expect(m.retention).toEqual({ cohort: 0, retained: 0, rate: null });
  });

  it('keeps an audit log that only admins can read', async () => {
    expect((await w.req('GET', '/admin/audit', 'agent')).statusCode).toBe(403);
    const log = (await w.req('GET', '/admin/audit', 'admin')).json();
    expect(log.entities).toEqual(expect.arrayContaining(['sale', 'settings']));
    const sale = log.items.find((i: { action: string }) => i.action === 'sale.recorded');
    expect(sale).toMatchObject({ actor: 'Ravi Agent', entity: 'sale', actorType: 'admin' });
    expect(sale.after).toMatchObject({ commissionPaise: 100_000, eligible: true });
    expect((await w.req('GET', '/admin/audit?entity=sale', 'admin')).json().items.every((i: { entity: string }) => i.entity === 'sale')).toBe(true);
    expect((await w.req('GET', '/admin/audit?q=rule.saved', 'admin')).json().total).toBeGreaterThan(0);
    expect((await w.req('GET', `/admin/audit?from=${today}&to=${today}`, 'admin')).json().total).toBe(log.total);
  });

  it('manages the team: add, change role, deactivate, with safeguards', async () => {
    expect((await w.req('GET', '/admin/team', 'agent')).statusCode).toBe(403);
    const list = (await w.req('GET', '/admin/team', 'admin')).json().items;
    expect(list.map((m: { email: string; isYou: boolean }) => [m.email, m.isYou]).sort()).toEqual([['admin@ho.test', true], ['agent@ho.test', false]]);

    expect((await w.req('POST', '/admin/team', 'admin', { name: 'X', email: 'not-an-email', role: 'agent' })).statusCode).toBe(400);
    const fresh = await w.req('POST', '/admin/team', 'admin', { name: 'Nina Agent', email: 'Nina@HO.test', role: 'agent' });
    expect(fresh.statusCode).toBe(201);
    expect(fresh.json().tempPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect((await w.req('POST', '/admin/team', 'admin', { name: 'Nina', email: 'nina@ho.test', role: 'admin' })).json().error.code).toBe('duplicate');

    // someone who already has a login keeps their password
    w.auth.users.set('second@ho.test', tokens.second!.sub);
    const existing = await w.req('POST', '/admin/team', 'admin', { name: 'Sam Admin', email: 'second@ho.test', role: 'admin' });
    expect(existing.json().tempPassword).toBeNull();
    const secondId = existing.json().id;
    expect((await w.req('GET', '/admin/overview', 'second')).statusCode).toBe(200);

    expect((await w.req('PATCH', `/admin/team/${list.find((m: { isYou: boolean }) => m.isYou).id}`, 'admin', { role: 'agent' })).json().error.code).toBe('self_change');
    expect((await w.req('PATCH', `/admin/team/${secondId}`, 'admin', { active: false })).statusCode).toBe(204);
    expect((await w.req('GET', '/admin/overview', 'second')).statusCode).toBe(403); // takes effect straight away
    expect((await w.req('PATCH', `/admin/team/${secondId}`, 'agent', { active: true })).statusCode).toBe(403);
    expect((await w.req('PATCH', `/admin/team/${secondId}`, 'admin', { active: true, role: 'agent' })).statusCode).toBe(204);
    expect((await w.req('POST', '/admin/partners/' + glowId + '/decision', 'second', { action: 'suspend', note: 'agents cannot do this' })).statusCode).toBe(403);
  });

  it('erases a customer who withdraws consent, and stops the lead being worked', async () => {
    expect((await w.req('POST', `/admin/leads/${ids.l2}/withdraw-consent`, 'agent', { note: 'x' })).statusCode).toBe(400);
    expect((await w.req('POST', `/admin/leads/${ids.l2}/withdraw-consent`, 'agent', { note: 'Customer called and asked us to delete their details' })).statusCode).toBe(204);
    const [lead] = await w.db.select().from(leadsTable).where(eq(leadsTable.id, ids.l2!));
    expect(lead).toMatchObject({ consentStatus: 'withdrawn', stage: 'closed_lost', customerName: 'Withdrawn', customerPhone: '0000000000', city: null, notes: null });
    expect(lead!.personalDataErasedAt).not.toBeNull();

    expect((await w.req('POST', `/admin/leads/${ids.l2}/stage`, 'agent', { stage: 'in_touch' })).json().error.code).toBe('consent_withdrawn');
    expect((await w.req('POST', `/admin/leads/${ids.l2}/sales/preview`, 'agent', { saleDate: today, lines: [{ categoryId: CAT, netPaise: 100_000 }] })).json().error.code).toBe('consent_withdrawn');
    const bulk = (await w.req('POST', '/admin/leads/bulk-stage', 'agent', { leadIds: [ids.l2], stage: 'in_touch' })).json();
    expect(bulk.rows[0]).toMatchObject({ outcome: 'skipped', reason: 'The customer withdrew consent' });
    expect((await w.req('POST', `/admin/leads/${ids.l2}/withdraw-consent`, 'agent', { note: 'Asked again by email' })).json().error.code).toBe('already_withdrawn');

    // a lead that already bought stays "purchased", and its commission is kept
    expect((await w.req('POST', `/admin/leads/${ids.l1}/withdraw-consent`, 'agent', { note: 'Customer asked to be forgotten' })).statusCode).toBe(204);
    const [bought] = await w.db.select().from(leadsTable).where(eq(leadsTable.id, ids.l1!));
    expect(bought).toMatchObject({ stage: 'purchased', customerName: 'Withdrawn' });
    expect((await w.req('GET', `/admin/commissions/${ids.commission}`, 'agent')).statusCode).toBe(200);
  });

  it('lets a partner ask for account deletion, and an admin close it once no money is owed', async () => {
    expect((await w.req('POST', '/me/delete-account', 'admin')).statusCode).toBe(403);
    expect((await w.req('POST', '/me/delete-account', 'rani')).json()).toEqual({ status: 'requested' });
    expect((await w.req('POST', '/me/delete-account', 'rani')).statusCode).toBe(202); // asking twice is harmless
    expect((await w.req('GET', '/admin/overview', 'agent')).json().partners.deletionRequests).toBe(1);
    expect((await w.req('GET', '/partner/application', 'rani')).json().deletionRequestedAt).not.toBeNull();

    // Glow asks too but is owed commission: can't be closed yet
    await w.req('POST', '/me/delete-account', 'glow');
    expect((await w.req('POST', `/admin/partners/${glowId}/close-account`, 'admin', { note: 'Requested in the app' })).json().error.code).toBe('open_money');
    // not requested → refused
    const other = (await addPartner(w.db, { name: 'No Request Salon', phone: '9866666666', code: 'HOC00003' })).partner.id;
    expect((await w.req('POST', `/admin/partners/${other}/close-account`, 'admin', { note: 'No request was made' })).json().error.code).toBe('not_requested');

    const [ru] = await w.db.select().from(partnerUsers).where(eq(partnerUsers.partnerId, raniId));
    await w.db.insert(pushTokens).values({ partnerUserId: ru!.id, token: 'ExponentPushToken[rani]', platform: 'android' });
    await w.db.update(partnersTable).set({ email: 'rani@example.com', addressLine: '12 Main Road', pincode: '122001', ownerName: 'Rani K' }).where(eq(partnersTable.id, raniId));
    const docType = (await w.db.execute(`select id from document_types limit 1` as never)) as unknown as { id: string }[];
    await w.db.insert(partnerDocuments).values({ partnerId: raniId, documentTypeId: docType[0]!.id, storagePath: `partners/${raniId}/pan/x.pdf`, fileName: 'pan.pdf', mimeType: 'application/pdf', sizeBytes: 10 });

    expect((await w.req('POST', `/admin/partners/${raniId}/close-account`, 'agent', { note: 'Requested in the app' })).statusCode).toBe(403);
    expect((await w.req('POST', `/admin/partners/${raniId}/close-account`, 'admin', { note: 'Requested in the app' })).statusCode).toBe(204);
    const [closed] = await w.db.select().from(partnersTable).where(eq(partnersTable.id, raniId));
    expect(closed).toMatchObject({ status: 'suspended', ownerName: null, email: null, addressLine: null, pincode: null, businessName: 'Rani Parlour', code: 'HOC00002' });
    expect(closed!.closedAt).not.toBeNull();
    expect(w.removed).toContain(`partners/${raniId}/pan/x.pdf`);
    expect(await w.db.select().from(pushTokens)).toHaveLength(0);
    expect((await w.req('GET', '/me', 'rani')).json()).toMatchObject({ kind: 'partner', active: false });
    expect((await w.req('GET', '/partner/lead-options', 'rani')).statusCode).toBe(403);
    expect((await w.req('POST', `/admin/partners/${raniId}/close-account`, 'admin', { note: 'Again' })).json().error.code).toBe('already_closed');
    expect((await w.req('GET', '/admin/overview', 'agent')).json().partners.deletionRequests).toBe(1); // Glow's, still open
  });

  it('deletes the login of someone who never registered', async () => {
    expect((await w.req('POST', '/me/delete-account', 'stranger')).json()).toEqual({ status: 'deleted' });
    expect(w.auth.deleted).toEqual([tokens.stranger!.sub]);
  });
});
