import {
  auditLog,
  commissionEntries,
  partners,
  payoutBatches,
  payouts,
  type Db,
} from '@hoc/db';
import {
  applyBps,
  formatINR,
  type AdminRole,
  type BatchDetail,
  type BatchSummary,
  type PayoutDetails,
  type PayoutPlan,
} from '@hoc/shared';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FieldCipher } from '../lib/crypto';
import { toCsv } from '../lib/csv';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { noopNotifier, type Notifier } from '../lib/notify';
import { loadSettings } from '../lib/settings';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Q = Db | Tx;

export interface AdminActor {
  adminUserId: string;
  role: AdminRole;
}

interface PlanInternals {
  plan: PayoutPlan;
  ids: Map<string, { commissionIds: string[]; clawbackIds: string[] }>;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const rupees = (paise: number) => (paise / 100).toFixed(2);

export function createPayoutService({
  db,
  cipher,
  notify = noopNotifier,
  now = () => new Date(),
}: {
  db: Db;
  cipher: FieldCipher;
  notify?: Notifier;
  now?: () => Date;
}) {
  function requireAdmin(actor: AdminActor) {
    if (actor.role !== 'admin') throw forbidden('forbidden', 'Only admins can manage payouts.');
  }

  async function audit(q: Q, actor: AdminActor, entityId: string, action: string, extra: { after?: unknown; reason?: string | null } = {}, entity = 'payout_batch') {
    await q.insert(auditLog).values({
      actorType: 'admin',
      actorId: actor.adminUserId,
      entity,
      entityId,
      action,
      after: extra.after ?? null,
      reason: extra.reason ?? null,
    });
  }

  /**
   * Who would be paid if a batch were created now.
   * Gross = approved commissions not yet in a payout. Reversals = commissions reversed after they were paid
   * and not yet deducted. TDS is charged on (gross − reversals).
   */
  async function computePlan(q: Q): Promise<PlanInternals> {
    const s = await loadSettings(db);
    const [approved, claws] = await Promise.all([
      q
        .select({ id: commissionEntries.id, partnerId: commissionEntries.partnerId, amountPaise: commissionEntries.amountPaise })
        .from(commissionEntries)
        .where(and(eq(commissionEntries.status, 'approved'), isNull(commissionEntries.payoutId))),
      q
        .select({ id: commissionEntries.id, partnerId: commissionEntries.partnerId, amountPaise: commissionEntries.amountPaise })
        .from(commissionEntries)
        .innerJoin(payouts, eq(payouts.id, commissionEntries.payoutId))
        .where(and(eq(commissionEntries.status, 'reversed'), isNull(commissionEntries.clawbackPayoutId), eq(payouts.status, 'paid'))),
    ]);

    const byPartner = new Map<string, { commissionIds: string[]; gross: number; clawbackIds: string[]; claw: number }>();
    const slot = (id: string) => {
      let v = byPartner.get(id);
      if (!v) byPartner.set(id, (v = { commissionIds: [], gross: 0, clawbackIds: [], claw: 0 }));
      return v;
    };
    for (const a of approved) {
      const v = slot(a.partnerId);
      v.commissionIds.push(a.id);
      v.gross += a.amountPaise;
    }
    for (const c of claws) {
      const v = slot(c.partnerId);
      v.clawbackIds.push(c.id);
      v.claw += c.amountPaise;
    }

    const partnerRows = byPartner.size
      ? await q.select().from(partners).where(inArray(partners.id, [...byPartner.keys()]))
      : [];
    const items: PayoutPlan['items'] = [];
    const skipped: PayoutPlan['skipped'] = [];
    const ids: PlanInternals['ids'] = new Map();

    for (const p of partnerRows.sort((a, b) => (a.businessName ?? '').localeCompare(b.businessName ?? ''))) {
      const v = byPartner.get(p.id)!;
      const name = p.businessName ?? 'Partner';
      const taxable = v.gross - v.claw;
      const skip = (reason: string) => skipped.push({ partnerId: p.id, name, code: p.code, reason, waitingPaise: v.gross });
      if (p.status === 'suspended') skip('Partner is suspended');
      else if (!p.payoutMethod || !p.payoutDetailsEncrypted) skip('No payout details on file');
      else if (v.gross === 0) skip(`Only reversals (${formatINR(v.claw)}) are waiting. They are deducted from the next commission.`);
      else if (taxable <= 0) skip(`Reversals (${formatINR(v.claw)}) are at least as much as the approved commission. Carried forward.`);
      else if (taxable < s.min_payout_paise) skip(`Below the minimum payout of ${formatINR(s.min_payout_paise)}. Rolls over.`);
      else {
        const tds = applyBps(taxable, s.tds_bps);
        items.push({
          partnerId: p.id,
          name,
          code: p.code,
          payoutDisplay: p.payoutDisplay,
          commissionCount: v.commissionIds.length,
          grossPaise: v.gross,
          clawbackPaise: v.claw,
          tdsPaise: tds,
          netPaise: taxable - tds,
        });
        ids.set(p.id, { commissionIds: v.commissionIds, clawbackIds: v.clawbackIds });
      }
    }
    const sum = (k: 'grossPaise' | 'clawbackPaise' | 'tdsPaise' | 'netPaise') => items.reduce((t, i) => t + i[k], 0);
    return {
      plan: {
        items,
        skipped,
        totals: { grossPaise: sum('grossPaise'), clawbackPaise: sum('clawbackPaise'), tdsPaise: sum('tdsPaise'), netPaise: sum('netPaise') },
        tdsBps: s.tds_bps,
        minPayoutPaise: s.min_payout_paise,
      },
      ids,
    };
  }

  async function loadBatch(id: string) {
    const [b] = await db.select().from(payoutBatches).where(eq(payoutBatches.id, id)).limit(1);
    if (!b) throw notFound('Payout batch not found');
    return b;
  }

  /** After a payout is paid / failed / cancelled: close the batch once nothing is pending. */
  async function settleBatch(tx: Tx, batchId: string) {
    const [{ pending } = { pending: 0 }] = await tx
      .select({ pending: sql<number>`count(*) filter (where ${payouts.status} = 'pending')::int` })
      .from(payouts)
      .where(eq(payouts.batchId, batchId));
    if (pending === 0) await tx.update(payoutBatches).set({ status: 'completed', completedAt: now() }).where(eq(payoutBatches.id, batchId));
  }

  /** Puts a payout's commissions back to "approved" and frees the reversals it deducted. */
  async function release(tx: Tx, payoutId: string) {
    await tx
      .update(commissionEntries)
      .set({ status: 'approved', payoutId: null })
      .where(and(eq(commissionEntries.payoutId, payoutId), eq(commissionEntries.status, 'in_payout')));
    await tx.update(commissionEntries).set({ clawbackPayoutId: null }).where(eq(commissionEntries.clawbackPayoutId, payoutId));
  }

  async function detail(id: string): Promise<BatchDetail> {
    const b = await loadBatch(id);
    const rows = await db
      .select({ p: payouts, name: partners.businessName, code: partners.code, display: partners.payoutDisplay })
      .from(payouts)
      .innerJoin(partners, eq(partners.id, payouts.partnerId))
      .where(eq(payouts.batchId, id))
      .orderBy(partners.businessName);
    const counts = await db
      .select({ payoutId: commissionEntries.payoutId, n: sql<number>`count(*)::int` })
      .from(commissionEntries)
      .where(inArray(commissionEntries.payoutId, rows.length ? rows.map((r) => r.p.id) : ['00000000-0000-0000-0000-000000000000']))
      .groupBy(commissionEntries.payoutId);
    const live = rows.filter((r) => r.p.status === 'pending' || r.p.status === 'paid');
    return {
      id: b.id,
      label: b.label,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      exportedAt: iso(b.exportedAt),
      completedAt: iso(b.completedAt),
      payoutCount: rows.length,
      paidCount: rows.filter((r) => r.p.status === 'paid').length,
      netPaise: live.reduce((t, r) => t + r.p.netPaise, 0),
      payouts: rows.map(({ p, name, code, display }) => ({
        id: p.id,
        partner: { id: p.partnerId, name: name ?? 'Partner', code },
        payoutDisplay: display,
        commissionCount: counts.find((c) => c.payoutId === p.id)?.n ?? 0,
        grossPaise: p.grossPaise,
        clawbackPaise: p.clawbackPaise,
        tdsPaise: p.tdsPaise,
        netPaise: p.netPaise,
        status: p.status,
        utr: p.utr,
        paidAt: iso(p.paidAt),
        failureReason: p.failureReason,
      })),
    };
  }

  return {
    async preview(actor: AdminActor): Promise<PayoutPlan> {
      requireAdmin(actor);
      return (await computePlan(db)).plan;
    },

    async createBatch(actor: AdminActor, label: string): Promise<string> {
      requireAdmin(actor);
      return db.transaction(async (tx) => {
        // One batch is built at a time, so the same commission can't land in two batches.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hoc-payout-batch'))`);
        const { plan, ids } = await computePlan(tx);
        if (plan.items.length === 0) throw conflict('nothing_to_pay', 'No partners are ready to be paid.');
        const [batch] = await tx.insert(payoutBatches).values({ label, status: 'draft', createdBy: actor.adminUserId }).returning({ id: payoutBatches.id });
        for (const item of plan.items) {
          const [p] = await tx
            .insert(payouts)
            .values({
              batchId: batch!.id,
              partnerId: item.partnerId,
              grossPaise: item.grossPaise,
              clawbackPaise: item.clawbackPaise,
              tdsPaise: item.tdsPaise,
              netPaise: item.netPaise,
              status: 'pending',
            })
            .returning({ id: payouts.id });
          const mine = ids.get(item.partnerId)!;
          const moved = await tx
            .update(commissionEntries)
            .set({ status: 'in_payout', payoutId: p!.id })
            .where(and(inArray(commissionEntries.id, mine.commissionIds), eq(commissionEntries.status, 'approved'), isNull(commissionEntries.payoutId)))
            .returning({ id: commissionEntries.id });
          if (moved.length !== mine.commissionIds.length) throw conflict('state_changed', 'Commissions changed while the batch was being built. Try again.');
          if (mine.clawbackIds.length) {
            await tx
              .update(commissionEntries)
              .set({ clawbackPayoutId: p!.id })
              .where(and(inArray(commissionEntries.id, mine.clawbackIds), isNull(commissionEntries.clawbackPayoutId)));
          }
        }
        await audit(tx, actor, batch!.id, 'payout_batch.created', { after: { label, partners: plan.items.length, ...plan.totals } });
        return batch!.id;
      });
    },

    async listBatches(actor: AdminActor): Promise<BatchSummary[]> {
      requireAdmin(actor);
      const rows = await db
        .select({
          b: payoutBatches,
          payoutCount: sql<number>`count(${payouts.id})::int`,
          paidCount: sql<number>`(count(*) filter (where ${payouts.status} = 'paid'))::int`,
          net: sql<number>`coalesce(sum(${payouts.netPaise}) filter (where ${payouts.status} in ('pending','paid')), 0)::int`,
        })
        .from(payoutBatches)
        .leftJoin(payouts, eq(payouts.batchId, payoutBatches.id))
        .groupBy(payoutBatches.id)
        .orderBy(desc(payoutBatches.createdAt));
      return rows.map((r) => ({
        id: r.b.id,
        label: r.b.label,
        status: r.b.status,
        createdAt: r.b.createdAt.toISOString(),
        exportedAt: iso(r.b.exportedAt),
        completedAt: iso(r.b.completedAt),
        payoutCount: r.payoutCount,
        paidCount: r.paidCount,
        netPaise: r.net,
      }));
    },

    async batch(actor: AdminActor, id: string): Promise<BatchDetail> {
      requireAdmin(actor);
      return detail(id);
    },

    /** The file for finance: who to pay, where, and how much. Includes PAN (for TDS filing) and bank details, so every download is audited. */
    async exportCsv(actor: AdminActor, id: string): Promise<{ fileName: string; csv: string }> {
      requireAdmin(actor);
      const b = await loadBatch(id);
      if (b.status === 'cancelled') throw conflict('cancelled', 'This batch was cancelled.');
      const rows = await db
        .select({ p: payouts, pm: partners })
        .from(payouts)
        .innerJoin(partners, eq(partners.id, payouts.partnerId))
        .where(and(eq(payouts.batchId, id), inArray(payouts.status, ['pending', 'paid'])))
        .orderBy(partners.businessName);
      const header = [
        'Payout ref', 'Partner code', 'Business name', 'Owner', 'Method', 'UPI ID', 'Account holder', 'Account number', 'IFSC',
        'PAN', 'Gross (INR)', 'Reversals deducted (INR)', 'TDS (INR)', 'Net payable (INR)', 'Status', 'UTR',
      ];
      const body = rows.map(({ p, pm }) => {
        const pay = pm.payoutDetailsEncrypted ? (JSON.parse(cipher.decrypt(pm.payoutDetailsEncrypted)) as PayoutDetails) : null;
        return [
          p.id.slice(0, 8).toUpperCase(),
          pm.code,
          pm.businessName,
          pm.ownerName,
          pay?.method === 'upi' ? 'UPI' : pay ? 'Bank transfer' : null,
          pay?.method === 'upi' ? pay.upiId : null,
          pay?.method === 'bank' ? pay.accountHolder : null,
          pay?.method === 'bank' ? pay.accountNumber : null,
          pay?.method === 'bank' ? pay.ifsc : null,
          pm.panEncrypted ? cipher.decrypt(pm.panEncrypted) : null,
          rupees(p.grossPaise),
          rupees(p.clawbackPaise),
          rupees(p.tdsPaise),
          rupees(p.netPaise),
          p.status === 'paid' ? 'Paid' : 'To pay',
          p.utr,
        ];
      });
      await db.transaction(async (tx) => {
        if (b.status === 'draft') await tx.update(payoutBatches).set({ status: 'exported', exportedAt: now() }).where(eq(payoutBatches.id, id));
        await audit(tx, actor, id, 'payout_batch.exported', { after: { payouts: rows.length } });
      });
      const slug = b.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'payouts';
      return { fileName: `ho-connect-payouts-${slug}.csv`, csv: toCsv([header, ...body]) };
    },

    async markPaid(actor: AdminActor, batchId: string, payoutId: string, utr: string) {
      requireAdmin(actor);
      const b = await loadBatch(batchId);
      if (b.status === 'cancelled') throw conflict('cancelled', 'This batch was cancelled.');
      const paid = await db.transaction(async (tx) => {
        const done = await tx
          .update(payouts)
          .set({ status: 'paid', utr, paidAt: now(), failureReason: null })
          .where(and(eq(payouts.id, payoutId), eq(payouts.batchId, batchId), eq(payouts.status, 'pending')))
          .returning({ partnerId: payouts.partnerId, net: payouts.netPaise });
        if (done.length === 0) throw conflict('not_pending', 'This payout is not waiting for payment.');
        await tx
          .update(commissionEntries)
          .set({ status: 'paid' })
          .where(and(eq(commissionEntries.payoutId, payoutId), eq(commissionEntries.status, 'in_payout')));
        await audit(tx, actor, batchId, 'payout.paid', { after: { payoutId, utr, netPaise: done[0]!.net } });
        await settleBatch(tx, batchId);
        return done[0]!;
      });
      void notify.toPartner(paid.partnerId, { title: 'Payment sent', body: `${formatINR(paid.net)} has been paid to you. Reference ${utr}.`, url: '/me/earnings' });
    },

    async markFailed(actor: AdminActor, batchId: string, payoutId: string, reason: string) {
      requireAdmin(actor);
      const b = await loadBatch(batchId);
      if (b.status === 'cancelled') throw conflict('cancelled', 'This batch was cancelled.');
      await db.transaction(async (tx) => {
        const done = await tx
          .update(payouts)
          .set({ status: 'failed', failureReason: reason })
          .where(and(eq(payouts.id, payoutId), eq(payouts.batchId, batchId), eq(payouts.status, 'pending')))
          .returning({ id: payouts.id });
        if (done.length === 0) throw conflict('not_pending', 'This payout is not waiting for payment.');
        await release(tx, payoutId);
        await audit(tx, actor, batchId, 'payout.failed', { after: { payoutId }, reason });
        await settleBatch(tx, batchId);
      });
    },

    /** Cancel a batch nobody has been paid from: every commission goes back to "approved". */
    async cancelBatch(actor: AdminActor, batchId: string, reason: string) {
      requireAdmin(actor);
      if (reason.trim().length < 5) throw badRequest('reason_required', 'Say why the batch is cancelled (at least 5 characters).');
      const b = await loadBatch(batchId);
      if (b.status === 'cancelled' || b.status === 'completed') throw conflict('not_cancellable', `A ${b.status} batch can't be cancelled.`);
      await db.transaction(async (tx) => {
        const rows = await tx.select({ id: payouts.id, status: payouts.status }).from(payouts).where(eq(payouts.batchId, batchId));
        if (rows.some((r) => r.status === 'paid')) {
          throw conflict('has_payments', 'Some partners in this batch are already paid. Mark the rest paid or failed instead.');
        }
        for (const r of rows) {
          await release(tx, r.id);
          await tx.update(payouts).set({ status: 'cancelled' }).where(eq(payouts.id, r.id));
        }
        await tx.update(payoutBatches).set({ status: 'cancelled', completedAt: now() }).where(eq(payoutBatches.id, batchId));
        await audit(tx, actor, batchId, 'payout_batch.cancelled', { reason });
      });
    },
  };
}

export type PayoutService = ReturnType<typeof createPayoutService>;
