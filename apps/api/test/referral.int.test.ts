/**
 * The customer QR / link page, the reminder (nudge), push notifications, earnings and the rate card,
 * against a real Postgres. Skipped unless TEST_DATABASE_URL is set. Wipes the database.
 */
import { consentRecords, leadEvents, leads as leadsTable, messageLog, messageTemplates, pushTokens } from '@hoc/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { createNotifier } from '../src/lib/notify';
import type { PushMessage, PushSender } from '../src/lib/push';
import type { SmsSender } from '../src/lib/sms';
import { addAdmins, addPartner, categories, createWorld, newToken, testDatabaseUrl, verifiedLead, type Tokens } from './helpers';

const url = testDatabaseUrl();
const tokens: Tokens = {
  admin: newToken({ email: 'admin@ho.test' }),
  agent: newToken({ email: 'agent@ho.test' }),
  glow: newToken({ phone: '919811111111' }),
  rani: newToken({ phone: '919822222222' }),
  applicant: newToken({ phone: '919833333333' }),
};

const sent: { to: string; body: string; templateId: string | null }[] = [];
let failNext = false;
const sms: SmsSender = {
  name: 'nimbus',
  async send(m) {
    if (failNext) {
      failNext = false;
      return { ok: false, error: 'gateway down' };
    }
    sent.push({ to: m.to, body: m.body, templateId: m.providerTemplateId });
    return { ok: true, providerRef: `sms-${sent.length}` };
  },
};
const codeFor = (to: string) => /\b(\d{6})\b/.exec([...sent].reverse().find((m) => m.to === to)?.body ?? '')?.[1] ?? '';

const pushed: PushMessage[] = [];
const deadTokens = new Set<string>();
const push: PushSender = {
  name: 'expo',
  async send(messages) {
    pushed.push(...messages);
    return messages.map((m) => (deadTokens.has(m.to) ? { ok: false as const, invalidToken: true, error: 'DeviceNotRegistered' } : { ok: true as const }));
  },
};

let w: Awaited<ReturnType<typeof createWorld>>;
let CAT = '';
let glowId = '';
const PUSH_TOKEN = 'ExponentPushToken[test_Glow-1]';
const customer = (o: Record<string, unknown> = {}) => ({ customerName: 'meera kapoor', customerPhone: '+91 99999 00001', categoryIds: [CAT], city: 'New Delhi', channel: 'qr', consent: true, ...o });
const backdateCodes = (leadId: string) => w.db.update(consentRecords).set({ createdAt: new Date(Date.now() - 120_000) }).where(eq(consentRecords.leadId, leadId));

describe.skipIf(!url)('referral page, reminders, push, earnings (Postgres)', () => {
  beforeAll(async () => {
    w = await createWorld({ url: url!, tokens, sms, notify: (db) => createNotifier({ db, push, log: () => {} }) });
    await addAdmins(w.db, tokens);
    glowId = (await addPartner(w.db, { token: tokens.glow, name: 'Glow Studio', phone: '9811111111', code: 'HOC00001' })).partner.id;
    await addPartner(w.db, { token: tokens.rani, name: 'Rani Parlour', phone: '9822222222', code: 'HOC00002' });
    await addPartner(w.db, { token: tokens.applicant, name: 'New Salon', phone: '9833333333', code: null, status: 'submitted' });
    await addPartner(w.db, { name: 'Paused Salon', phone: '9844444444', code: 'HOC00004', status: 'suspended' });
    CAT = (await categories(w.db))[0]!.id;
  });
  afterAll(async () => {
    await w?.close();
  });

  it('registers push tokens for partners, and only valid ones', async () => {
    expect((await w.req('POST', '/partner/push-token', 'glow', { token: 'not-a-token', platform: 'android' })).statusCode).toBe(400);
    expect((await w.req('POST', '/partner/push-token', 'agent', { token: PUSH_TOKEN, platform: 'android' })).statusCode).toBe(403);
    expect((await w.req('POST', '/partner/push-token', 'glow', { token: PUSH_TOKEN, platform: 'android' })).statusCode).toBe(204);
    expect((await w.req('POST', '/partner/push-token', 'glow', { token: PUSH_TOKEN, platform: 'android' })).statusCode).toBe(204);
    expect(await w.db.select().from(pushTokens)).toHaveLength(1);
    // applicants who are not approved yet can register too: they are told when a decision is made
    expect((await w.req('POST', '/partner/push-token', 'applicant', { token: 'ExponentPushToken[applicant_1]', platform: 'ios' })).statusCode).toBe(204);
  });

  it('serves the partner page without leaking anything, and only for active partners', async () => {
    const ok = await w.req('GET', '/public/referral/hoc00001');
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.partnerName).toBe('Glow Studio');
    expect(body.consent.version).toBe('0.1-draft');
    expect(body.consent.text).toContain('Glow Studio may share my name and phone number with HairOriginals');
    expect(body.categories.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/9811111111|Glow Studio\"?,\"phone/);
    expect((await w.req('GET', '/public/referral/HOC00099')).statusCode).toBe(404);
    expect((await w.req('GET', '/public/referral/HOC00004')).statusCode).toBe(404); // suspended
    expect((await w.req('GET', '/public/referral/bad!code')).statusCode).toBe(400);
  });

  it('gives partners their QR and link, and the poster image to anyone', async () => {
    const r = (await w.req('GET', '/partner/referral', 'glow')).json();
    expect(r).toMatchObject({ code: 'HOC00001', link: 'http://localhost:3000/r/HOC00001?c=link', qrLink: 'http://localhost:3000/r/HOC00001?c=qr', posterUrl: 'http://localhost:3000/r/HOC00001/poster' });
    expect(r.qrSvg.startsWith('<?xml') || r.qrSvg.startsWith('<svg')).toBe(true);
    expect(r.shareText).toContain(r.link);
    expect((await w.req('GET', '/partner/referral', 'applicant')).json().error.code).toBe('partner_not_approved');

    const svg = await w.req('GET', '/public/referral/HOC00001/qr.svg');
    expect(svg.statusCode).toBe(200);
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    expect(svg.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(svg.body).toContain('<svg');
    expect((await w.req('GET', '/public/referral/HOC00004/qr.svg')).statusCode).toBe(404);
  });

  it('gives partners and staff an AI try-on QR tagged with the partner code', async () => {
    const r = (await w.req('GET', '/partner/referral', 'glow')).json();
    expect(r.tryOn).toMatchObject({
      link: 'https://aitryon.hairoriginals.com/?utm_source=ho_connect&utm_medium=partner_link&utm_campaign=HOC00001&utm_content=glow-studio',
      qrLink: 'https://aitryon.hairoriginals.com/?utm_source=ho_connect&utm_medium=partner_qr&utm_campaign=HOC00001&utm_content=glow-studio',
      posterUrl: 'http://localhost:3000/r/HOC00001/tryon-poster',
    });
    expect(r.tryOn.qrSvg).toContain('<svg');
    expect(r.tryOn.qrSvg).not.toBe(r.qrSvg);
    expect(r.tryOn.shareText).toContain(r.tryOn.link);

    const svg = await w.req('GET', '/public/referral/hoc00001/tryon-qr.svg');
    expect(svg.statusCode).toBe(200);
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    expect(svg.body).toBe(r.tryOn.qrSvg);
    expect((await w.req('GET', '/public/referral/HOC00004/tryon-qr.svg')).statusCode).toBe(404); // suspended

    // Staff: the same codes for any partner with a partner code, flagged when the partner is not active.
    const adminView = await w.req('GET', `/admin/partners/${glowId}/referral`, 'agent');
    expect(adminView.statusCode).toBe(200);
    expect(adminView.json()).toMatchObject({ code: 'HOC00001', active: true, tryOn: { qrLink: r.tryOn.qrLink } });
    const partnersList = (await w.req('GET', '/admin/partners?status=suspended', 'admin')).json();
    const pausedId = partnersList.items.find((p: { code: string | null }) => p.code === 'HOC00004').id;
    expect((await w.req('GET', `/admin/partners/${pausedId}/referral`, 'admin')).json()).toMatchObject({ code: 'HOC00004', active: false });
    const applicantId = (await w.req('GET', '/admin/partners?status=submitted', 'admin')).json().items[0].id;
    expect((await w.req('GET', `/admin/partners/${applicantId}/referral`, 'admin')).json().error.code).toBe('no_partner_code');
    expect((await w.req('GET', `/admin/partners/${glowId}/referral`, 'glow')).statusCode).toBe(403);
  });

  it('validates the customer form and ignores bots that fill the hidden field', async () => {
    const bad = async (o: Record<string, unknown>) => (await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer(o))).json().error.message;
    expect(await bad({ customerPhone: '12345' })).toBe('Enter a valid 10-digit mobile number');
    expect(await bad({ consent: false })).toBe('Please tick the box to agree');
    expect(await bad({ categoryIds: [] })).toBe('Choose what you are interested in');
    expect(await bad({ customerName: 'A' })).toBe('Enter your name');

    const before = sent.length;
    const bot = await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer({ website: 'http://spam.example' }));
    expect(bot.statusCode).toBe(201); // looks successful...
    expect(sent.length).toBe(before); // ...but nothing was sent
    expect(await w.db.select().from(leadsTable)).toHaveLength(0);
  });

  let leadId = '';

  it('starts a referral from the QR page and texts the customer a code', async () => {
    const res = await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer());
    expect(res.statusCode).toBe(201);
    leadId = res.json().leadId;
    expect(res.json().devCode).toBeUndefined();
    expect(sent.at(-1)).toMatchObject({ to: '9999900001' });
    expect(sent.at(-1)!.body).toMatch(/^\d{6} is your OTP to confirm your referral to HairOriginals by Glow Studio\./);

    const [lead] = await w.db.select().from(leadsTable).where(eq(leadsTable.id, leadId));
    expect(lead).toMatchObject({ channel: 'qr', partnerId: glowId, createdByPartnerUserId: null, stage: 'awaiting_consent', customerPhone: '9999900001' });
    const events = await w.db.select().from(leadEvents).where(eq(leadEvents.leadId, leadId));
    expect(events.map((e) => [e.type, e.actorType])).toEqual(expect.arrayContaining([['created', 'customer'], ['consent_sent', 'customer']]));

    const mine = (await w.req('GET', `/partner/leads/${leadId}`, 'glow')).json();
    expect(mine).toMatchObject({ customerName: 'Meera K.', stageLabel: 'Waiting for customer confirmation' });
  });

  it('sends the code again for the same number instead of failing, within the resend limit', async () => {
    const first = codeFor('9999900001');
    expect((await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer())).json().error.code).toBe('too_soon');
    await backdateCodes(leadId);
    const again = await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer());
    expect(again.statusCode).toBe(201);
    expect(again.json().leadId).toBe(leadId);
    expect(codeFor('9999900001')).not.toBe(first);
    await backdateCodes(leadId);
    expect((await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer())).json().error.code).toBe('resend_limit');
    expect(await w.db.select().from(leadsTable)).toHaveLength(1);
  });

  it('confirms with the customer’s code, records where from, and tells the partner', async () => {
    const wrong = codeFor('9999900001') === '000000' ? '111111' : '000000';
    expect((await w.req('POST', `/public/leads/${leadId}/confirm`, undefined, { code: wrong })).json().error.message).toBe('That code is wrong. 4 tries left.');
    const ok = await w.req('POST', `/public/leads/${leadId}/confirm`, undefined, { code: codeFor('9999900001') }, { 'user-agent': 'Mobile Safari', 'x-forwarded-for': '203.0.113.9' });
    expect(ok.json()).toEqual({ confirmed: true });
    expect((await w.req('POST', `/public/leads/${leadId}/confirm`, undefined, { code: codeFor('9999900001') })).json().error.code).toBe('not_waiting');

    const [lead] = await w.db.select().from(leadsTable).where(eq(leadsTable.id, leadId));
    expect(lead).toMatchObject({ stage: 'under_review', consentStatus: 'confirmed' });
    expect(lead!.ownedUntil).not.toBeNull();
    const verified = (await w.db.select().from(consentRecords).where(eq(consentRecords.leadId, leadId))).find((r) => r.verifiedAt);
    expect(verified).toMatchObject({ userAgent: 'Mobile Safari', consentTextVersion: '0.1-draft' });
    await vi.waitFor(() => expect(pushed.at(-1)).toMatchObject({ to: PUSH_TOKEN, title: 'Meera K. confirmed', data: { url: `/leads/${leadId}` } }));
    // partner-created leads can't be confirmed through the public endpoint
    const mine = await verifiedLead(w.db, glowId, { stage: 'awaiting_consent', consentStatus: 'pending' });
    expect((await w.req('POST', `/public/leads/${mine.id}/confirm`, undefined, { code: '123456' })).statusCode).toBe(404);
  });

  it('gives one neutral answer for own numbers and customers someone else already referred', async () => {
    const before = sent.length;
    const own = await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer({ customerPhone: '9811111111' }));
    const taken = await w.req('POST', '/public/referral/HOC00002/leads', undefined, customer()); // Glow owns 9999900001 now
    for (const r of [own, taken]) {
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('unavailable');
      expect(r.json().error.message).toBe("We couldn't start this referral. If you're already in touch with HairOriginals, our team will contact you.");
    }
    expect(sent.length).toBe(before);
  });

  it('caps codes per phone and per day, and always asks for the code even if consent is switched off', async () => {
    for (let i = 0; i < 3; i++) {
      await w.db.insert(messageLog).values({ channel: 'sms', toPhone: '+919999900005', templateKey: 'consent_otp', status: 'sent' });
    }
    expect((await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer({ customerPhone: '9999900005' }))).json().error.code).toBe('too_many_codes');

    const todays = (await w.db.select().from(leadsTable)).filter((l) => l.channel === 'qr' || l.channel === 'link').length;
    await w.req('PUT', '/admin/settings', 'admin', { max_public_leads_per_day: todays });
    expect((await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer({ customerPhone: '9999900006' }))).json().error.code).toBe('busy');
    await w.req('PUT', '/admin/settings', 'admin', { max_public_leads_per_day: 200, require_customer_otp: false });
    const res = await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer({ customerPhone: '9999900007' }));
    expect(res.statusCode).toBe(201);
    expect((await w.db.select().from(leadsTable).where(eq(leadsTable.customerPhone, '9999900007')))[0]!.stage).toBe('awaiting_consent');
    expect(sent.at(-1)!.to).toBe('9999900007');
    await w.req('PUT', '/admin/settings', 'admin', { require_customer_otp: true });
  });

  it('frees the number when the SMS could not be sent, so the customer can retry', async () => {
    failNext = true;
    const failed = await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer({ customerPhone: '9999900008' }));
    expect(failed.statusCode).toBe(502);
    expect((await w.db.select().from(leadsTable).where(eq(leadsTable.customerPhone, '9999900008')))[0]!.stage).toBe('consent_expired');
    expect((await w.req('POST', '/public/referral/HOC00001/leads', undefined, customer({ customerPhone: '9999900008' }))).statusCode).toBe(201);
  });

  it('rate-limits the public form per IP', async () => {
    const limited = await buildApp({ ...w.deps, rateLimit: true });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      codes.push((await limited.inject({ method: 'POST', url: '/v1/public/referral/HOC00001/leads', payload: { nope: true } })).statusCode);
    }
    await limited.close();
    expect(codes.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  let unreachable = '';
  it('hides the reminder until an SMS template is registered, and refuses templates with unfilled blanks', async () => {
    unreachable = (await verifiedLead(w.db, glowId, { stage: 'unreachable', customerName: 'Arjun Mehta' })).id;
    expect((await w.req('GET', `/partner/leads/${unreachable}`, 'glow')).json().nudge).toEqual({ available: false, reason: null });
    expect((await w.req('POST', `/partner/leads/${unreachable}/nudge`, 'glow')).json().error.code).toBe('nudge_unavailable');

    // registered, but still containing a placeholder we cannot fill
    await w.db.update(messageTemplates).set({ channel: 'sms', providerTemplateId: '1707000000000000001' }).where(eq(messageTemplates.key, 'customer_nudge'));
    const before = sent.length;
    expect((await w.req('POST', `/partner/leads/${unreachable}/nudge`, 'glow')).json().error.code).toBe('nudge_unavailable');
    expect(sent.length).toBe(before);
  });

  it('sends the approved reminder at most twice, with a pause between', async () => {
    await w.db.update(messageTemplates).set({ body: 'Hi {{customer_name}}, we tried to reach you about your HairOriginals consultation (referred by {{partner_name}}). Please call us back.' }).where(eq(messageTemplates.key, 'customer_nudge'));
    expect((await w.req('GET', `/partner/leads/${unreachable}`, 'glow')).json().nudge).toEqual({ available: true, reason: null });

    const res = await w.req('POST', `/partner/leads/${unreachable}/nudge`, 'glow');
    expect(res.statusCode).toBe(200);
    expect(sent.at(-1)).toMatchObject({ templateId: '1707000000000000001' });
    expect(sent.at(-1)!.body).toBe('Hi Arjun, we tried to reach you about your HairOriginals consultation (referred by Glow Studio). Please call us back.');
    expect(res.json().nudge.available).toBe(false);
    expect(res.json().nudge.reason).toMatch(/^You can send another reminder after /);
    expect(res.json().timeline.at(-1).label).toBe('You sent a reminder');
    expect((await w.req('POST', `/partner/leads/${unreachable}/nudge`, 'glow')).json().error.code).toBe('too_soon');

    await w.db.update(leadEvents).set({ createdAt: new Date(Date.now() - 3 * 86400_000) }).where(and(eq(leadEvents.leadId, unreachable), eq(leadEvents.type, 'nudge_sent')));
    expect((await w.req('POST', `/partner/leads/${unreachable}/nudge`, 'glow')).statusCode).toBe(200);
    await w.db.update(leadEvents).set({ createdAt: new Date(Date.now() - 3 * 86400_000) }).where(and(eq(leadEvents.leadId, unreachable), eq(leadEvents.type, 'nudge_sent')));
    expect((await w.req('POST', `/partner/leads/${unreachable}/nudge`, 'glow')).json().error.code).toBe('nudge_limit');

    const other = await verifiedLead(w.db, glowId, { stage: 'in_touch' });
    expect((await w.req('POST', `/partner/leads/${other.id}/nudge`, 'glow')).json().error.code).toBe('not_unreachable');
  });

  it('pushes a masked stage update to the partner, and forgets dead tokens', async () => {
    pushed.length = 0;
    expect((await w.req('POST', `/admin/leads/${unreachable}/stage`, 'agent', { stage: 'in_touch' })).statusCode).toBe(200);
    await vi.waitFor(() => expect(pushed).toHaveLength(1));
    expect(pushed[0]).toMatchObject({ to: PUSH_TOKEN, title: 'Arjun M.', body: 'HO team in touch', data: { url: `/leads/${unreachable}` } });

    deadTokens.add(PUSH_TOKEN);
    expect((await w.req('POST', `/admin/leads/${unreachable}/stage`, 'agent', { stage: 'consultation_done' })).statusCode).toBe(200);
    await vi.waitFor(async () => expect(await w.db.select().from(pushTokens).where(eq(pushTokens.token, PUSH_TOKEN))).toHaveLength(0));
    expect((await w.req('POST', '/partner/push-token/remove', 'glow', { token: 'ExponentPushToken[applicant_1]' })).statusCode).toBe(204); // someone else's token: nothing happens
    expect(await w.db.select().from(pushTokens)).toHaveLength(1);
  });

  it('shows the rate card in partner wording, without duplicates', async () => {
    const plan = (await w.req('GET', '/admin/commission-plans', 'agent')).json().plans[0];
    const rule = plan.rules.find((r: { customerType: string | null }) => r.customerType === 'new');
    const { id: _i, description: _d, ...body } = rule;
    await w.req('PUT', `/admin/commission-plans/${plan.id}/rules/${rule.id}`, 'admin', { ...body, rateValue: 750, maxPaise: 500_000 });

    let card = (await w.req('GET', '/partner/rate-card', 'glow')).json();
    expect(card.planName).toBe('Default plan');
    expect(card.lines).toEqual([
      { product: 'Any product', customer: 'Already connected with HO', rate: '0% of the product value (before GST)', limits: null },
      { product: 'Any product', customer: 'New customer for HO', rate: '7.5% of the product value (before GST)', limits: 'at most ₹5,000' },
    ]);
    expect(card.notes).toEqual([
      "Commission is paid on the customer's first purchase.",
      'A customer is credited to you for 90 days after they confirm.',
      'Commission becomes payable 30 days after the sale, to allow for returns.',
      'Payouts start from ₹500; smaller amounts roll over.',
    ]);
    await w.req('PUT', '/admin/settings', 'admin', { tds_bps: 200 });
    card = (await w.req('GET', '/partner/rate-card', 'glow')).json();
    expect(card.notes.at(-1)).toBe('TDS of 2% is deducted from payouts as per Income Tax rules.');
    expect((await w.req('GET', '/partner/rate-card', 'applicant')).json().error.code).toBe('partner_not_approved');
  });

  it('summarises earnings for the partner', async () => {
    const e = (await w.req('GET', '/partner/earnings', 'glow')).json();
    expect(e).toEqual({ totals: { pendingPaise: 0, approvedPaise: 0, beingPaidPaise: 0, paidPaise: 0 }, entries: [], payouts: [] });
    expect((await w.req('GET', '/partner/earnings', 'applicant')).statusCode).toBe(403);
  });
});
