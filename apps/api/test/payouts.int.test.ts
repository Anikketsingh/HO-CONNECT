/**
 * Payout batches against a real Postgres: build a batch (TDS, minimums, reversals), export the finance CSV,
 * mark paid / failed / cancelled. Skipped unless TEST_DATABASE_URL is set. Wipes the database.
 */
import { commissionEntries, partners as partnersTable, payouts as payoutsTable } from '@hoc/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toCsv } from '../src/lib/csv';
import type { Notifier, PartnerNotice } from '../src/lib/notify';
import { addAdmins, addPartner, categories, createWorld, newToken, testDatabaseUrl, verifiedLead, type Tokens } from './helpers';

const url = testDatabaseUrl();
const tokens: Tokens = { admin: newToken({ email: 'admin@ho.test' }), agent: newToken({ email: 'agent@ho.test' }), glow: newToken({ phone: '919811111111' }) };

const notices: { partnerId: string; notice: PartnerNotice }[] = [];
const notify: Notifier = { async toPartner(partnerId, notice) { notices.push({ partnerId, notice }); } };

let w: Awaited<ReturnType<typeof createWorld>>;
let WIG = '';
const ids: Record<string, string> = {};

const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** A commission of `rupees` (10% rule) that has gone all the way to "approved". */
async function approvedCommission(partnerId: string, saleRupees: number) {
  const lead = await verifiedLead(w.db, partnerId);
  const res = await w.req('POST', `/admin/leads/${lead.id}/sales`, 'agent', { saleDate: today, lines: [{ categoryId: WIG, netPaise: saleRupees * 100 }] });
  expect(res.statusCode).toBe(201);
  const id = res.json().commissionId as string;
  await w.db.update(commissionEntries).set({ holdUntil: '2020-01-01' }).where(eq(commissionEntries.id, id));
  await w.commissions.advanceHolds();
  expect((await w.req('POST', '/admin/commissions/approve', 'admin', { ids: [id] })).json().approved).toBe(1);
  return id;
}

describe('toCsv', () => {
  it('quotes cells and defuses spreadsheet formulas', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', '=HYPERLINK("x")', '+91', '@x', null, 12.5]])).toBe(`a,"b,c","say ""hi""","'=HYPERLINK(""x"")",'+91,'@x,,12.5\r\n`);
  });
});

describe.skipIf(!url)('payouts (Postgres)', () => {
  beforeAll(async () => {
    w = await createWorld({ url: url!, tokens, notify });
    await addAdmins(w.db, tokens);
    const glow = await addPartner(w.db, { token: tokens.glow, name: 'Glow Studio', phone: '9811111111', code: 'HOC00001' });
    const rani = await addPartner(w.db, { name: 'Rani Parlour', phone: '9822222222', code: 'HOC00002' });
    const nopay = await addPartner(w.db, { name: 'No Payout Salon', phone: '9833333333', code: 'HOC00003' });
    const susp = await addPartner(w.db, { name: 'Suspended Salon', phone: '9844444444', code: 'HOC00004' });
    Object.assign(ids, { glow: glow.partner.id, rani: rani.partner.id, nopay: nopay.partner.id, susp: susp.partner.id, glowUser: glow.partnerUserId! });

    // Payout details for everyone except "No Payout Salon" (encrypted exactly as the app does it).
    const set = (partnerId: string, method: 'upi' | 'bank', details: object, display: string, pan: string) =>
      w.db.update(partnersTable).set({
        payoutMethod: method,
        payoutDetailsEncrypted: w.cipher.encrypt(JSON.stringify(details)),
        payoutDisplay: display,
        panEncrypted: w.cipher.encrypt(pan),
        panLast4: pan.slice(-4),
      }).where(eq(partnersTable.id, partnerId));
    await set(ids.glow!, 'upi', { method: 'upi', upiId: 'glow@okhdfcbank' }, 'UPI · glo•••@okhdfcbank', 'ABCDE1234F');
    await set(ids.rani!, 'bank', { method: 'bank', accountHolder: 'Rani K', accountNumber: '123456789012', ifsc: 'SBIN0001234' }, 'Bank · SBIN · ••••9012', 'PQRST6789K');
    await set(ids.susp!, 'upi', { method: 'upi', upiId: 'susp@okhdfcbank' }, 'UPI', 'ZZZZZ9999Z');
    await w.db.update(partnersTable).set({ status: 'suspended' }).where(eq(partnersTable.id, ids.susp!));

    WIG = (await categories(w.db))[1]!.id;
    // 10% commission for new customers.
    const plan = (await w.req('GET', '/admin/commission-plans', 'agent')).json().plans[0];
    const rule = plan.rules.find((r: { customerType: string | null }) => r.customerType === 'new');
    const { id: _i, description: _d, ...body } = rule;
    expect((await w.req('PUT', `/admin/commission-plans/${plan.id}/rules/${rule.id}`, 'admin', { ...body, rateValue: 1000 })).statusCode).toBe(204);
    expect((await w.req('PUT', '/admin/settings', 'admin', { tds_bps: 200 })).statusCode).toBe(204);
  });

  afterAll(async () => {
    await w?.close();
  });

  let glowSmall = '';
  let batch1 = '';
  let payout1 = '';

  it('is for admins only, and refuses an empty batch', async () => {
    expect((await w.req('GET', '/admin/payouts/preview', 'agent')).statusCode).toBe(403);
    expect((await w.req('GET', '/admin/payout-batches', 'glow')).statusCode).toBe(403);
    const empty = await w.req('POST', '/admin/payout-batches', 'admin', { label: 'November 2026' });
    expect(empty.statusCode).toBe(409);
    expect(empty.json().error.code).toBe('nothing_to_pay');
  });

  it('plans a batch: TDS on the total, and says why others are left out', async () => {
    await approvedCommission(ids.glow!, 60_000); // ₹6,000
    glowSmall = await approvedCommission(ids.glow!, 20_000); // ₹2,000
    await approvedCommission(ids.rani!, 3_000); // ₹300, below the ₹500 minimum
    await approvedCommission(ids.nopay!, 60_000);
    await approvedCommission(ids.susp!, 60_000);

    const plan = (await w.req('GET', '/admin/payouts/preview', 'admin')).json();
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ name: 'Glow Studio', commissionCount: 2, grossPaise: 800_000, clawbackPaise: 0, tdsPaise: 16_000, netPaise: 784_000 });
    expect(plan.totals).toMatchObject({ grossPaise: 800_000, tdsPaise: 16_000, netPaise: 784_000 });
    expect(Object.fromEntries(plan.skipped.map((s: { name: string; reason: string }) => [s.name, s.reason]))).toEqual({
      'Rani Parlour': 'Below the minimum payout of ₹500. Rolls over.',
      'No Payout Salon': 'No payout details on file',
      'Suspended Salon': 'Partner is suspended',
    });
  });

  it('builds the batch and locks the commissions in it', async () => {
    const created = await w.req('POST', '/admin/payout-batches', 'admin', { label: 'November 2026' });
    expect(created.statusCode).toBe(201);
    batch1 = created.json().id;
    const detail = (await w.req('GET', `/admin/payout-batches/${batch1}`, 'admin')).json();
    expect(detail).toMatchObject({ status: 'draft', payoutCount: 1, paidCount: 0, netPaise: 784_000 });
    payout1 = detail.payouts[0].id;
    expect(detail.payouts[0]).toMatchObject({ partner: { name: 'Glow Studio' }, commissionCount: 2, status: 'pending' });

    const rows = await w.db.select().from(commissionEntries).where(eq(commissionEntries.payoutId, payout1));
    expect(rows.map((r) => r.status)).toEqual(['in_payout', 'in_payout']);
    // nothing left for a second batch
    expect((await w.req('POST', '/admin/payout-batches', 'admin', { label: 'Again' })).json().error.code).toBe('nothing_to_pay');
    // a commission in a payout can't be reversed from under it
    expect((await w.req('POST', `/admin/commissions/${glowSmall}/reverse`, 'admin', { reason: 'Customer returned the wig' })).json().error.code).toBe('in_payout');
  });

  it('shows partners only payments that are on their way or done', async () => {
    let e = (await w.req('GET', '/partner/earnings', 'glow')).json();
    expect(e.totals).toEqual({ pendingPaise: 0, approvedPaise: 0, beingPaidPaise: 800_000, paidPaise: 0 });
    expect(e.payouts).toEqual([]); // still a draft
    expect(e.entries[0].label).toBe('being paid');
    expect(e.entries[0].customerName).toBe('Meera K.');

    const csv = await w.req('GET', `/admin/payout-batches/${batch1}/csv`, 'admin');
    expect(csv.statusCode).toBe(200);
    e = (await w.req('GET', '/partner/earnings', 'glow')).json();
    expect(e.payouts).toMatchObject([{ label: 'November 2026', status: 'pending', netPaise: 784_000, tdsPaise: 16_000, utr: null }]);
  });

  it('exports the finance CSV with bank details, PAN and amounts, and audits the download', async () => {
    expect((await w.req('GET', `/admin/payout-batches/${batch1}/csv`, 'agent')).statusCode).toBe(403);
    const res = await w.req('GET', `/admin/payout-batches/${batch1}/csv`, 'admin');
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-disposition']).toBe('attachment; filename="ho-connect-payouts-november-2026.csv"');
    const lines = res.body.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Payout ref,Partner code,Business name,Owner,Method,UPI ID,Account holder,Account number,IFSC,PAN,Gross (INR),Reversals deducted (INR),TDS (INR),Net payable (INR),Status,UTR');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(`${payout1.slice(0, 8).toUpperCase()},HOC00001,Glow Studio,Glow Studio,UPI,glow@okhdfcbank,,,,ABCDE1234F,8000.00,0.00,160.00,7840.00,To pay,`);
    expect((await w.req('GET', `/admin/payout-batches/${batch1}`, 'admin')).json().status).toBe('exported');
    const audit = await w.db.execute(`select action from audit_log where entity = 'payout_batch' and entity_id = '${batch1}' order by id` as never);
    expect((audit as unknown as { action: string }[]).map((a) => a.action)).toEqual(['payout_batch.created', 'payout_batch.exported', 'payout_batch.exported']);
  });

  it('marks a payout paid with a UTR, finishes the batch and tells the partner', async () => {
    expect((await w.req('POST', `/admin/payout-batches/${batch1}/payouts/${payout1}/paid`, 'admin', { utr: 'ab' })).statusCode).toBe(400);
    expect((await w.req('POST', `/admin/payout-batches/${batch1}/payouts/${payout1}/paid`, 'agent', { utr: 'UTIB12345678' })).statusCode).toBe(403);
    const ok = await w.req('POST', `/admin/payout-batches/${batch1}/payouts/${payout1}/paid`, 'admin', { utr: 'UTIB12345678' });
    expect(ok.statusCode).toBe(204);
    expect((await w.req('POST', `/admin/payout-batches/${batch1}/payouts/${payout1}/paid`, 'admin', { utr: 'UTIB12345678' })).json().error.code).toBe('not_pending');

    const detail = (await w.req('GET', `/admin/payout-batches/${batch1}`, 'admin')).json();
    expect(detail).toMatchObject({ status: 'completed', paidCount: 1 });
    expect(detail.payouts[0]).toMatchObject({ status: 'paid', utr: 'UTIB12345678' });
    const e = (await w.req('GET', '/partner/earnings', 'glow')).json();
    expect(e.totals).toMatchObject({ paidPaise: 800_000, beingPaidPaise: 0 });
    expect(e.payouts[0]).toMatchObject({ status: 'paid', utr: 'UTIB12345678', netPaise: 784_000 });
    expect(notices.at(-1)).toMatchObject({ partnerId: ids.glow, notice: { title: 'Payment sent', body: '₹7,840 has been paid to you. Reference UTIB12345678.' } });
  });

  it('deducts a commission reversed after it was paid from the next payout', async () => {
    expect((await w.req('POST', `/admin/commissions/${glowSmall}/reverse`, 'admin', { reason: 'Customer returned the wig' })).statusCode).toBe(204);
    // Only the reversal is waiting for Glow, so there is nothing to net it against yet.
    let plan = (await w.req('GET', '/admin/payouts/preview', 'admin')).json();
    expect(plan.skipped.find((s: { name: string }) => s.name === 'Glow Studio').reason).toMatch(/^Only reversals \(₹2,000\) are waiting/);

    await approvedCommission(ids.glow!, 60_000); // ₹6,000
    plan = (await w.req('GET', '/admin/payouts/preview', 'admin')).json();
    expect(plan.items[0]).toMatchObject({ grossPaise: 600_000, clawbackPaise: 200_000, tdsPaise: 8_000, netPaise: 392_000 }); // TDS on ₹4,000
  });

  it('puts everything back when a payout fails or a batch is cancelled', async () => {
    const b2 = (await w.req('POST', '/admin/payout-batches', 'admin', { label: 'December 2026' })).json().id;
    const p2 = (await w.req('GET', `/admin/payout-batches/${b2}`, 'admin')).json().payouts[0].id;
    const [reversed] = await w.db.select().from(commissionEntries).where(eq(commissionEntries.id, glowSmall));
    expect(reversed!.clawbackPayoutId).toBe(p2);

    expect((await w.req('POST', `/admin/payout-batches/${b2}/payouts/${p2}/failed`, 'admin', { reason: 'no' })).statusCode).toBe(400);
    expect((await w.req('POST', `/admin/payout-batches/${b2}/payouts/${p2}/failed`, 'admin', { reason: 'Bank rejected the UPI id' })).statusCode).toBe(204);
    expect((await w.req('GET', `/admin/payout-batches/${b2}`, 'admin')).json()).toMatchObject({ status: 'completed', payouts: [{ status: 'failed', failureReason: 'Bank rejected the UPI id' }] });
    expect((await w.db.select().from(commissionEntries).where(eq(commissionEntries.id, glowSmall)))[0]!.clawbackPayoutId).toBeNull();
    expect((await w.req('GET', '/partner/earnings', 'glow')).json().totals.approvedPaise).toBe(600_000);

    const b3 = (await w.req('POST', '/admin/payout-batches', 'admin', { label: 'December 2026 (retry)' })).json().id;
    expect((await w.req('POST', `/admin/payout-batches/${b3}/cancel`, 'admin', { reason: 'x' })).statusCode).toBe(400);
    expect((await w.req('POST', `/admin/payout-batches/${b3}/cancel`, 'admin', { reason: 'Wrong month label' })).statusCode).toBe(204);
    expect((await w.req('GET', `/admin/payout-batches/${b3}`, 'admin')).json()).toMatchObject({ status: 'cancelled', payouts: [{ status: 'cancelled' }] });
    expect((await w.req('GET', `/admin/payout-batches/${b3}/csv`, 'admin')).statusCode).toBe(409);
    expect((await w.req('GET', '/admin/payouts/preview', 'admin')).json().items[0]).toMatchObject({ clawbackPaise: 200_000, netPaise: 392_000 });
  });

  it('pays the reduced amount once and does not deduct the reversal twice', async () => {
    const b4 = (await w.req('POST', '/admin/payout-batches', 'admin', { label: 'January 2027' })).json().id;
    const p4 = (await w.req('GET', `/admin/payout-batches/${b4}`, 'admin')).json().payouts[0];
    expect(p4).toMatchObject({ grossPaise: 600_000, clawbackPaise: 200_000, netPaise: 392_000 });
    expect((await w.req('POST', `/admin/payout-batches/${b4}/payouts/${p4.id}/paid`, 'admin', { utr: 'HDFC00112233' })).statusCode).toBe(204);
    expect((await w.req('POST', `/admin/payout-batches/${b4}/cancel`, 'admin', { reason: 'Too late to cancel' })).json().error.code).toBe('not_cancellable');
    const plan = (await w.req('GET', '/admin/payouts/preview', 'admin')).json();
    expect(plan.items).toEqual([]);
    expect(plan.skipped.map((s: { name: string }) => s.name)).not.toContain('Glow Studio');
    const [row] = await w.db.select().from(payoutsTable).where(eq(payoutsTable.id, p4.id));
    expect(row).toMatchObject({ status: 'paid', clawbackPaise: 200_000 });
  });

  it('lists the batches', async () => {
    const list = (await w.req('GET', '/admin/payout-batches', 'admin')).json().items;
    expect(list).toHaveLength(4);
    expect(list.map((b: { label: string; status: string }) => [b.label, b.status])).toEqual(
      expect.arrayContaining([
        ['December 2026', 'completed'],
        ['December 2026 (retry)', 'cancelled'],
        ['January 2027', 'completed'],
        ['November 2026', 'completed'],
      ]),
    );
    expect(list[0].label).toBe('January 2027'); // newest first
  });
});
