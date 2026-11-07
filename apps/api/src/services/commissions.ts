import {
  adminUsers,
  auditLog,
  commissionEntries,
  commissionPlans,
  commissionRules,
  leadEvents,
  leads,
  partnerTypes,
  partners,
  planAssignments,
  productCategories,
  referralBenefits,
  saleLines,
  sales,
  settings as settingsTable,
  type Db,
  type RuleSnapshot,
} from '@hoc/db';
import {
  calculateCommission,
  COMMISSION_VIEWS,
  DEFAULT_SETTINGS,
  describeRule,
  FLAG_REASONS,
  formatINR,
  formatLeadRef,
  maskName,
  OPEN_PIPELINE_STAGES,
  parseLeadRef,
  settingsSchema,
  type AdminRole,
  type CommissionDetail,
  type CommissionList,
  type CommissionView,
  type CustomerType,
  type EngineRule,
  type FlagReason,
  type PlanList,
  type RateCard,
  type SalePreview,
} from '@hoc/shared';
import { and, asc, desc, eq, ilike, inArray, isNull, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { noopNotifier, type Notifier } from '../lib/notify';
import { loadSettings } from '../lib/settings';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type PlanScope = 'default' | 'partner_type' | 'partner';

export interface AdminActor {
  adminUserId: string;
  role: AdminRole;
}

export interface SaleFields {
  saleDate: string;
  invoiceNo: string | null;
  lines: { categoryId: string; netPaise: number }[];
  linkedManually: boolean;
  notes: string | null;
}

const PAGE = 50;
const SELLABLE = [...OPEN_PIPELINE_STAGES, 'purchased'] as const;

/** "YYYY-MM-DD" for an instant, in India time. */
const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
const istPretty = (date: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

const VIEW_FILTERS: Record<Exclude<CommissionView, 'all'>, SQL> = {
  approvable: sql`${commissionEntries.status} = 'approvable'`,
  flagged: sql`${commissionEntries.flagged} and ${commissionEntries.status} in ('pending','approvable')`,
  pending: sql`${commissionEntries.status} = 'pending'`,
  approved: sql`${commissionEntries.status} in ('approved','in_payout','paid')`,
  closed: sql`${commissionEntries.status} in ('reversed','rejected')`,
};

export function createCommissionService({ db, now = () => new Date(), notify = noopNotifier }: { db: Db; now?: () => Date; notify?: Notifier }) {
  const requireAdminRole = (actor: AdminActor) => {
    if (actor.role !== 'admin') throw forbidden('forbidden', 'Only admins can do this.');
  };

  async function audit(tx: Db | Tx, actor: AdminActor | null, entity: string, entityId: string, action: string, extra: { before?: unknown; after?: unknown; reason?: string | null } = {}) {
    await tx.insert(auditLog).values({
      actorType: actor ? 'admin' : 'system',
      actorId: actor?.adminUserId ?? null,
      entity,
      entityId,
      action,
      before: extra.before ?? null,
      after: extra.after ?? null,
      reason: extra.reason ?? null,
    });
  }

  async function categoryNames(): Promise<Map<string, string>> {
    const rows = await db.select({ id: productCategories.id, name: productCategories.name }).from(productCategories);
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Most specific assignment whose plan is active on the date: partner → partner type → default. */
  async function resolvePlan(partnerId: string, partnerTypeId: string, onDate: string) {
    const rows = await db
      .select({ scope: planAssignments.scope, plan: commissionPlans })
      .from(planAssignments)
      .innerJoin(commissionPlans, eq(commissionPlans.id, planAssignments.planId))
      .where(
        or(
          and(eq(planAssignments.scope, 'partner'), eq(planAssignments.scopeId, partnerId)),
          and(eq(planAssignments.scope, 'partner_type'), eq(planAssignments.scopeId, partnerTypeId)),
          and(eq(planAssignments.scope, 'default'), isNull(planAssignments.scopeId)),
        ),
      );
    for (const scope of ['partner', 'partner_type', 'default'] as const) {
      const a = rows.find((r) => r.scope === scope);
      if (a && a.plan.active && a.plan.effectiveFrom <= onDate && (!a.plan.effectiveTo || a.plan.effectiveTo >= onDate)) {
        return { plan: a.plan, via: scope };
      }
    }
    return null;
  }

  async function rulesOf(planId: string): Promise<EngineRule[]> {
    const rows = await db.select().from(commissionRules).where(eq(commissionRules.planId, planId));
    return rows.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      customerType: r.customerType,
      rateType: r.rateType,
      rateValue: r.rateValue,
      minPaise: r.minPaise,
      maxPaise: r.maxPaise,
      priority: r.priority,
    }));
  }

  /** Works out whether a sale earns commission, and how much. Throws if the sale can't be recorded at all. */
  async function evaluate(tx: Db | Tx, leadId: string, input: SaleFields) {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) throw notFound('Lead not found');
    if (lead.consentStatus === 'withdrawn') throw conflict('consent_withdrawn', 'The customer withdrew consent, so a sale cannot be recorded on this lead.');
    if (!lead.customerType || lead.customerType === 'invalid') {
      throw conflict('not_verified', 'Verify the lead in the verification queue before recording a sale.');
    }
    if (!(SELLABLE as readonly string[]).includes(lead.stage)) {
      throw conflict('not_sellable', `A sale can't be recorded on a lead that is "${lead.stage.replace(/_/g, ' ')}".`);
    }
    const today = istDate(now());
    if (input.saleDate > today) throw badRequest('future_date', "The sale date can't be in the future.");

    const [[partner], s, names] = await Promise.all([
      tx.select().from(partners).where(eq(partners.id, lead.partnerId)),
      loadSettings(db),
      categoryNames(),
    ]);
    for (const l of input.lines) {
      if (!names.has(l.categoryId)) throw badRequest('unknown_category', 'Choose a product category for every line.');
    }

    // Eligibility (the sale is still recorded when it isn't eligible, just without commission).
    let ineligibleReason: string | null = null;
    const referredOn = istDate(lead.consentConfirmedAt ?? lead.createdAt);
    if (!lead.ownedUntil) ineligibleReason = "This lead isn't owned by the partner.";
    else if (input.saleDate < referredOn) ineligibleReason = `The sale is before the customer was referred (${istPretty(referredOn)}).`;
    else if (input.saleDate > istDate(lead.ownedUntil)) {
      ineligibleReason = `The sale is after the ownership window ended on ${istPretty(istDate(lead.ownedUntil))}.`;
    } else {
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(commissionEntries)
        .where(and(eq(commissionEntries.leadId, lead.id), notInArray(commissionEntries.status, ['reversed', 'rejected'])));
      if (n >= s.commissionable_sales_per_lead) ineligibleReason = 'This lead already earned its commission (first purchase only).';
    }

    const resolved = await resolvePlan(lead.partnerId, partner!.partnerTypeId, input.saleDate);
    const rules = resolved ? await rulesOf(resolved.plan.id) : [];
    const calc = calculateCommission(rules, lead.customerType as CustomerType, input.lines);

    const flags: FlagReason[] = [];
    if (lead.customerType !== 'new') flags.push('existing_customer_type');
    if (input.linkedManually) flags.push('linked_manually');
    if (!resolved) flags.push('no_plan');
    else if (calc.lines.some((l) => !l.rule)) flags.push('no_rule');

    const preview: SalePreview = {
      eligible: ineligibleReason === null,
      ineligibleReason,
      plan: resolved ? { id: resolved.plan.id, name: resolved.plan.name, via: resolved.via } : null,
      customerType: lead.customerType,
      lines: calc.lines.map((l) => ({
        categoryId: l.categoryId,
        categoryName: names.get(l.categoryId) ?? 'Unknown',
        netPaise: l.netPaise,
        rule: l.rule ? describeRule(l.rule, l.rule.categoryId ? (names.get(l.rule.categoryId) ?? null) : null) : null,
        amountPaise: l.amountPaise,
      })),
      totalPaise: ineligibleReason ? 0 : calc.totalPaise,
      flags: ineligibleReason ? [] : flags.map((f) => ({ key: f, label: FLAG_REASONS[f] })),
      holdUntil: ineligibleReason ? null : addDays(input.saleDate, s.hold_days),
    };
    const snapshot: RuleSnapshot = {
      planId: resolved?.plan.id ?? '',
      planName: resolved?.plan.name ?? '(no plan)',
      assignedVia: resolved?.via ?? 'default',
      customerType: lead.customerType as CustomerType,
      lines: calc.lines.map((l) => ({
        categoryId: l.categoryId,
        netPaise: l.netPaise,
        ruleId: l.rule?.id ?? null,
        rateType: l.rule?.rateType ?? null,
        rateValue: l.rule?.rateValue ?? null,
        minPaise: l.rule?.minPaise ?? null,
        maxPaise: l.rule?.maxPaise ?? null,
        amountPaise: l.amountPaise,
      })),
    };
    return { lead, preview, snapshot, flags };
  }

  function rowOf(r: {
    c: typeof commissionEntries.$inferSelect;
    leadNumber: number;
    customerName: string;
    customerType: CustomerType | null;
    partnerName: string | null;
    partnerCode: string | null;
    sale: typeof sales.$inferSelect;
  }) {
    return {
      id: r.c.id,
      status: r.c.status,
      amountPaise: r.c.amountPaise,
      calculatedPaise: r.c.calculatedPaise,
      adjustmentPaise: r.c.adjustmentPaise,
      flagged: r.c.flagged,
      flags: r.c.flagReasons,
      holdUntil: r.c.holdUntil,
      createdAt: r.c.createdAt.toISOString(),
      lead: { id: r.c.leadId, ref: formatLeadRef(r.leadNumber), customerName: r.customerName, customerType: r.customerType },
      partner: { id: r.c.partnerId, name: r.partnerName ?? 'Partner', code: r.partnerCode },
      sale: {
        id: r.sale.id,
        saleDate: r.sale.saleDate,
        invoiceNo: r.sale.invoiceNo,
        totalNetPaise: r.sale.totalNetPaise,
        status: r.sale.status,
      },
    };
  }

  const rowSelect = {
    c: commissionEntries,
    leadNumber: leads.number,
    customerName: leads.customerName,
    customerType: leads.customerType,
    partnerName: partners.businessName,
    partnerCode: partners.code,
    sale: sales,
  };

  async function loadEntry(id: string) {
    const [c] = await db.select().from(commissionEntries).where(eq(commissionEntries.id, id)).limit(1);
    if (!c) throw notFound('Commission not found');
    return c;
  }

  return {
    /* ───────────── Sales ───────────── */

    async previewSale(leadId: string, input: SaleFields): Promise<SalePreview> {
      return (await evaluate(db, leadId, input)).preview;
    },

    async recordSale(actor: AdminActor, leadId: string, input: SaleFields) {
      const s = await loadSettings(db);
      let toNotify: { partnerId: string; leadId: string; name: string; amountPaise: number } | null = null;
      const result = await db.transaction(async (tx) => {
        // One sale at a time per lead, so two agents can't both create the "first purchase" commission.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lead-sale:${leadId}`}))`);
        const { lead, preview, snapshot, flags } = await evaluate(tx, leadId, input);
        const total = input.lines.reduce((sum, l) => sum + l.netPaise, 0);
        const [sale] = await tx
          .insert(sales)
          .values({
            leadId,
            source: 'manual',
            invoiceNo: input.invoiceNo,
            saleDate: input.saleDate,
            totalNetPaise: total,
            enteredBy: actor.adminUserId,
            notes: input.notes,
          })
          .returning({ id: sales.id });
        await tx.insert(saleLines).values(input.lines.map((l) => ({ saleId: sale!.id, categoryId: l.categoryId, netPaise: l.netPaise })));

        let commissionId: string | null = null;
        if (preview.eligible) {
          const [entry] = await tx
            .insert(commissionEntries)
            .values({
              partnerId: lead.partnerId,
              leadId,
              saleId: sale!.id,
              calculatedPaise: preview.totalPaise,
              amountPaise: preview.totalPaise,
              ruleSnapshot: snapshot,
              flagged: flags.length > 0,
              flagReasons: flags,
              status: 'pending',
              holdUntil: addDays(input.saleDate, s.hold_days),
            })
            .returning({ id: commissionEntries.id });
          commissionId = entry!.id;
        }

        if (lead.stage !== 'purchased') {
          await tx.update(leads).set({ stage: 'purchased', stageChangedAt: now() }).where(eq(leads.id, leadId));
        }
        await tx.insert(leadEvents).values({
          leadId,
          type: 'sale_recorded',
          actorType: 'admin',
          actorId: actor.adminUserId,
          fromStage: lead.stage,
          toStage: 'purchased',
          note: input.notes,
          // Partners see "Purchased" and their commission, never the invoice value.
          meta: { saleId: sale!.id, commissionId },
        });
        await audit(tx, actor, 'sale', sale!.id, 'sale.recorded', {
          after: { leadId, total, lines: input.lines.length, commissionPaise: preview.totalPaise, eligible: preview.eligible, flags },
          reason: preview.ineligibleReason,
        });
        if (preview.eligible) toNotify = { partnerId: lead.partnerId, leadId, name: lead.customerName, amountPaise: preview.totalPaise };
        return { saleId: sale!.id, commissionId, preview };
      });
      const n = toNotify as { partnerId: string; leadId: string; name: string; amountPaise: number } | null;
      if (n) {
        void notify.toPartner(n.partnerId, {
          title: `${maskName(n.name)} purchased`,
          body: `Commission ${formatINR(n.amountPaise)} pending.`,
          url: `/leads/${n.leadId}`,
        });
      }
      return result;
    },

    /* ───────────── Commissions ───────────── */

    async list(query: { view: CommissionView; q?: string; partnerId?: string; page: number }): Promise<CommissionList> {
      const base: SQL[] = [];
      if (query.partnerId) base.push(eq(commissionEntries.partnerId, query.partnerId));
      if (query.q) {
        const q = query.q.trim();
        const ref = /^l-?\d+$/i.test(q) ? parseLeadRef(q) : null;
        const term = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        base.push(
          ref ? eq(leads.number, ref) : or(ilike(leads.customerName, term), ilike(partners.businessName, term), ilike(sales.invoiceNo, term))!,
        );
      }
      const conds = [...base];
      if (query.view !== 'all') conds.push(VIEW_FILTERS[query.view]);
      const where = conds.length ? and(...conds) : undefined;
      const order =
        query.view === 'approvable' || query.view === 'pending' || query.view === 'flagged'
          ? [asc(commissionEntries.holdUntil), asc(commissionEntries.createdAt)]
          : [desc(commissionEntries.createdAt)];
      const from = () =>
        db
          .select(rowSelect)
          .from(commissionEntries)
          .innerJoin(leads, eq(leads.id, commissionEntries.leadId))
          .innerJoin(partners, eq(partners.id, commissionEntries.partnerId))
          .innerJoin(sales, eq(sales.id, commissionEntries.saleId));

      const countCols = Object.fromEntries(
        COMMISSION_VIEWS.map((v) => [v, v === 'all' ? sql<number>`count(*)::int` : sql<number>`(count(*) filter (where ${VIEW_FILTERS[v]}))::int`]),
      ) as Record<CommissionView, SQL<number>>;

      const [rows, [agg], [counts]] = await Promise.all([
        from().where(where).orderBy(...order).limit(PAGE).offset((query.page - 1) * PAGE),
        db
          .select({ total: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${commissionEntries.amountPaise}), 0)::int` })
          .from(commissionEntries)
          .innerJoin(leads, eq(leads.id, commissionEntries.leadId))
          .innerJoin(partners, eq(partners.id, commissionEntries.partnerId))
          .innerJoin(sales, eq(sales.id, commissionEntries.saleId))
          .where(where),
        db
          .select(countCols)
          .from(commissionEntries)
          .innerJoin(leads, eq(leads.id, commissionEntries.leadId))
          .innerJoin(partners, eq(partners.id, commissionEntries.partnerId))
          .innerJoin(sales, eq(sales.id, commissionEntries.saleId))
          .where(base.length ? and(...base) : undefined),
      ]);
      return {
        items: rows.map(rowOf),
        total: agg?.total ?? 0,
        page: query.page,
        pageSize: PAGE,
        counts: counts as Record<CommissionView, number>,
        sumPaise: agg?.sum ?? 0,
      };
    },

    async detail(id: string): Promise<CommissionDetail> {
      const [r] = await db
        .select({ ...rowSelect, approverName: adminUsers.name })
        .from(commissionEntries)
        .innerJoin(leads, eq(leads.id, commissionEntries.leadId))
        .innerJoin(partners, eq(partners.id, commissionEntries.partnerId))
        .innerJoin(sales, eq(sales.id, commissionEntries.saleId))
        .leftJoin(adminUsers, eq(adminUsers.id, commissionEntries.approvedBy))
        .where(eq(commissionEntries.id, id))
        .limit(1);
      if (!r) throw notFound('Commission not found');
      const [names, history] = await Promise.all([
        categoryNames(),
        db
          .select({ action: auditLog.action, actorType: auditLog.actorType, actorName: adminUsers.name, reason: auditLog.reason, createdAt: auditLog.createdAt })
          .from(auditLog)
          .leftJoin(adminUsers, eq(adminUsers.id, auditLog.actorId))
          .where(
            or(
              and(eq(auditLog.entity, 'commission'), eq(auditLog.entityId, id)),
              and(eq(auditLog.entity, 'sale'), eq(auditLog.entityId, r.sale.id)),
            ),
          )
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id)),
      ]);
      const snap = r.c.ruleSnapshot;
      return {
        ...rowOf(r),
        adjustmentReason: r.c.adjustmentReason,
        statusReason: r.c.statusReason,
        approvedBy: r.approverName ?? (r.c.approvedAt ? 'Automatic' : null),
        approvedAt: r.c.approvedAt?.toISOString() ?? null,
        snapshot: {
          planName: snap.planName,
          assignedVia: snap.assignedVia,
          customerType: snap.customerType,
          lines: snap.lines.map((l) => ({
            categoryName: names.get(l.categoryId) ?? 'Unknown',
            netPaise: l.netPaise,
            rule:
              l.rateType !== null && l.rateValue !== null
                ? describeRule(
                    { rateType: l.rateType, rateValue: l.rateValue, minPaise: l.minPaise, maxPaise: l.maxPaise, customerType: null },
                    null,
                  ).replace(' · any product · any customer', '')
                : null,
            amountPaise: l.amountPaise,
          })),
        },
        history: history.map((h) => ({
          action: h.action,
          actor: h.actorType === 'admin' ? (h.actorName ?? 'HO team') : 'System',
          reason: h.reason,
          createdAt: h.createdAt.toISOString(),
        })),
      };
    },

    async approve(actor: AdminActor, ids: string[]) {
      requireAdminRole(actor);
      const t = now();
      const approvedIds: string[] = [];
      const result = await db.transaction(async (tx) => {
        const done = await tx
          .update(commissionEntries)
          .set({ status: 'approved', approvedBy: actor.adminUserId, approvedAt: t })
          .where(and(inArray(commissionEntries.id, ids), eq(commissionEntries.status, 'approvable')))
          .returning({ id: commissionEntries.id, amount: commissionEntries.amountPaise });
        for (const d of done) await audit(tx, actor, 'commission', d.id, 'commission.approved', { after: { amountPaise: d.amount } });
        approvedIds.push(...done.map((d) => d.id));
        return { approved: done.length, skipped: ids.length - done.length };
      });
      if (approvedIds.length) {
        const rows = await db
          .select({ id: commissionEntries.id, partnerId: commissionEntries.partnerId, leadId: commissionEntries.leadId, amount: commissionEntries.amountPaise, name: leads.customerName })
          .from(commissionEntries)
          .innerJoin(leads, eq(leads.id, commissionEntries.leadId))
          .where(inArray(commissionEntries.id, approvedIds));
        for (const r of rows) {
          void notify.toPartner(r.partnerId, { title: 'Commission approved', body: `${formatINR(r.amount)} for ${maskName(r.name)} is approved and will be in your next payout.`, url: '/me/earnings' });
        }
      }
      return result;
    },

    async adjust(actor: AdminActor, id: string, input: { adjustmentPaise: number; reason: string }) {
      requireAdminRole(actor);
      const c = await loadEntry(id);
      if (!['pending', 'approvable', 'approved'].includes(c.status)) {
        throw conflict('not_adjustable', `A ${c.status.replace('_', ' ')} commission can't be adjusted.`);
      }
      const amount = c.calculatedPaise + input.adjustmentPaise;
      if (amount < 0) throw badRequest('negative_amount', 'The adjusted amount would be below ₹0.');
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(commissionEntries)
          .set({
            adjustmentPaise: input.adjustmentPaise,
            adjustmentReason: input.reason,
            amountPaise: amount,
            flagged: true,
            flagReasons: [...new Set([...c.flagReasons, 'adjusted'])],
            // A changed amount needs approving again.
            ...(c.status === 'approved' ? { status: 'approvable' as const, approvedBy: null, approvedAt: null } : {}),
          })
          .where(and(eq(commissionEntries.id, id), eq(commissionEntries.status, c.status)))
          .returning({ id: commissionEntries.id });
        if (updated.length === 0) throw conflict('state_changed', 'Someone else just changed this commission. Reload and try again.');
        await audit(tx, actor, 'commission', id, 'commission.adjusted', {
          before: { amountPaise: c.amountPaise },
          after: { amountPaise: amount, adjustmentPaise: input.adjustmentPaise },
          reason: input.reason,
        });
      });
    },

    async reject(actor: AdminActor, id: string, reason: string) {
      requireAdminRole(actor);
      const c = await loadEntry(id);
      if (!['pending', 'approvable', 'approved'].includes(c.status)) {
        throw conflict('not_rejectable', `A ${c.status.replace('_', ' ')} commission can't be rejected. Reverse it instead.`);
      }
      await db.transaction(async (tx) => {
        await tx.update(commissionEntries).set({ status: 'rejected', statusReason: reason }).where(eq(commissionEntries.id, id));
        await audit(tx, actor, 'commission', id, 'commission.rejected', { before: { status: c.status }, reason });
      });
    },

    /** The sale was returned or cancelled. Paid commissions are netted against the next payout (Milestone 5). */
    async reverse(actor: AdminActor, id: string, reason: string) {
      requireAdminRole(actor);
      const c = await loadEntry(id);
      if (c.status === 'reversed' || c.status === 'rejected') throw conflict('already_closed', 'This commission is already closed.');
      if (c.status === 'in_payout') {
        throw conflict('in_payout', 'This commission is in an open payout. Mark that payout paid or failed first, then reverse it: a paid commission is deducted from the next payout.');
      }
      await db.transaction(async (tx) => {
        await tx.update(commissionEntries).set({ status: 'reversed', statusReason: reason }).where(eq(commissionEntries.id, id));
        await tx.update(sales).set({ status: 'returned' }).where(eq(sales.id, c.saleId));
        await tx.insert(leadEvents).values({
          leadId: c.leadId,
          type: 'sale_updated',
          actorType: 'admin',
          actorId: actor.adminUserId,
          note: reason,
          meta: { saleId: c.saleId, status: 'returned' },
        });
        await audit(tx, actor, 'commission', id, 'commission.reversed', { before: { status: c.status, amountPaise: c.amountPaise }, reason });
      });
    },

    /** Daily job: commissions leave the hold period; unflagged ones are auto-approved if that setting is on. */
    async advanceHolds() {
      const today = istDate(now());
      const s = await loadSettings(db);
      const released = await db
        .update(commissionEntries)
        .set({ status: 'approvable' })
        .where(and(eq(commissionEntries.status, 'pending'), sql`${commissionEntries.holdUntil} <= ${today}`))
        .returning({ id: commissionEntries.id });
      let autoApproved = 0;
      if (s.auto_approve_unflagged) {
        const done = await db
          .update(commissionEntries)
          .set({ status: 'approved', approvedAt: now() })
          .where(and(eq(commissionEntries.status, 'approvable'), eq(commissionEntries.flagged, false)))
          .returning({ id: commissionEntries.id });
        for (const d of done) await audit(db, null, 'commission', d.id, 'commission.auto_approved');
        autoApproved = done.length;
      }
      return { released: released.length, autoApproved };
    },

    /* ───────────── Settings: plans and rules ───────────── */

    async listPlans(): Promise<PlanList> {
      const [plans, rules, assigns, names, types, partnerRows] = await Promise.all([
        db.select().from(commissionPlans).orderBy(desc(commissionPlans.active), asc(commissionPlans.name)),
        db.select().from(commissionRules).orderBy(desc(commissionRules.priority), asc(commissionRules.createdAt)),
        db.select().from(planAssignments),
        categoryNames(),
        db.select({ id: partnerTypes.id, name: partnerTypes.name }).from(partnerTypes).orderBy(asc(partnerTypes.sortOrder)),
        db.select({ id: partners.id, name: partners.businessName, code: partners.code }).from(partners),
      ]);
      const typeName = new Map(types.map((t) => [t.id, t.name]));
      const partnerName = new Map(partnerRows.map((p) => [p.id, `${p.name ?? 'Partner'}${p.code ? ` (${p.code})` : ''}`]));
      return {
        plans: plans.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          effectiveFrom: p.effectiveFrom,
          effectiveTo: p.effectiveTo,
          active: p.active,
          rules: rules
            .filter((r) => r.planId === p.id)
            .map((r) => ({
              id: r.id,
              categoryId: r.categoryId,
              customerType: r.customerType,
              rateType: r.rateType,
              rateValue: r.rateValue,
              minPaise: r.minPaise,
              maxPaise: r.maxPaise,
              priority: r.priority,
              description: describeRule(r, r.categoryId ? (names.get(r.categoryId) ?? null) : null),
            })),
          assignedTo: assigns
            .filter((a) => a.planId === p.id)
            .map((a) => ({
              scope: a.scope,
              scopeId: a.scopeId,
              label:
                a.scope === 'default'
                  ? 'Default for everyone'
                  : a.scope === 'partner_type'
                    ? `All ${typeName.get(a.scopeId!) ?? 'partner type'} partners`
                    : (partnerName.get(a.scopeId!) ?? 'A partner'),
            })),
        })),
        categories: [...names].map(([id, name]) => ({ id, name })),
        partnerTypes: types,
      };
    },

    async createPlan(actor: AdminActor, input: { name: string; description?: string | null; effectiveFrom: string; effectiveTo?: string | null; active?: boolean }) {
      requireAdminRole(actor);
      const [p] = await db
        .insert(commissionPlans)
        .values({ ...input, description: input.description ?? null, effectiveTo: input.effectiveTo ?? null })
        .returning({ id: commissionPlans.id });
      await audit(db, actor, 'settings', p!.id, 'plan.created', { after: input });
      return p!.id;
    },

    async updatePlan(actor: AdminActor, id: string, input: Partial<{ name: string; description: string | null; effectiveFrom: string; effectiveTo: string | null; active: boolean }>) {
      requireAdminRole(actor);
      const [cur] = await db.select().from(commissionPlans).where(eq(commissionPlans.id, id));
      if (!cur) throw notFound('Plan not found');
      const from = input.effectiveFrom ?? cur.effectiveFrom;
      const to = input.effectiveTo === undefined ? cur.effectiveTo : input.effectiveTo;
      if (to && to < from) throw badRequest('bad_dates', 'The end date must be after the start date.');
      await db.update(commissionPlans).set(input).where(eq(commissionPlans.id, id));
      await audit(db, actor, 'settings', id, 'plan.updated', { before: cur, after: input });
    },

    async saveRule(actor: AdminActor, planId: string, ruleId: string | null, input: Omit<EngineRule, 'id'>) {
      requireAdminRole(actor);
      const [plan] = await db.select({ id: commissionPlans.id }).from(commissionPlans).where(eq(commissionPlans.id, planId));
      if (!plan) throw notFound('Plan not found');
      if (input.categoryId) {
        const [c] = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.id, input.categoryId));
        if (!c) throw badRequest('unknown_category', 'Choose a product category.');
      }
      if (ruleId) {
        const updated = await db
          .update(commissionRules)
          .set(input)
          .where(and(eq(commissionRules.id, ruleId), eq(commissionRules.planId, planId)))
          .returning({ id: commissionRules.id });
        if (updated.length === 0) throw notFound('Rule not found');
      } else {
        const [r] = await db.insert(commissionRules).values({ ...input, planId }).returning({ id: commissionRules.id });
        ruleId = r!.id;
      }
      await audit(db, actor, 'settings', ruleId, 'rule.saved', { after: { planId, ...input } });
      return ruleId;
    },

    async deleteRule(actor: AdminActor, planId: string, ruleId: string) {
      requireAdminRole(actor);
      const deleted = await db
        .delete(commissionRules)
        .where(and(eq(commissionRules.id, ruleId), eq(commissionRules.planId, planId)))
        .returning();
      if (deleted.length === 0) throw notFound('Rule not found');
      await audit(db, actor, 'settings', ruleId, 'rule.deleted', { before: deleted[0] });
    },

    async setAssignment(actor: AdminActor, input: { scope: PlanScope; scopeId: string | null; planId: string | null }) {
      requireAdminRole(actor);
      const scopeMatch = and(
        eq(planAssignments.scope, input.scope),
        input.scopeId ? eq(planAssignments.scopeId, input.scopeId) : isNull(planAssignments.scopeId),
      );
      await db.transaction(async (tx) => {
        await tx.delete(planAssignments).where(scopeMatch);
        if (input.planId) {
          const [p] = await tx.select({ id: commissionPlans.id }).from(commissionPlans).where(eq(commissionPlans.id, input.planId));
          if (!p) throw notFound('Plan not found');
          await tx.insert(planAssignments).values({ planId: input.planId, scope: input.scope, scopeId: input.scopeId });
        }
        await audit(tx, actor, 'settings', input.scopeId ?? 'default', 'plan.assigned', { after: input });
      });
    },

    async partnerPlan(partnerId: string) {
      const [p] = await db.select().from(partners).where(eq(partners.id, partnerId));
      if (!p) throw notFound('Partner not found');
      const [resolved, [override], plans] = await Promise.all([
        resolvePlan(p.id, p.partnerTypeId, istDate(now())),
        db
          .select({ planId: planAssignments.planId })
          .from(planAssignments)
          .where(and(eq(planAssignments.scope, 'partner'), eq(planAssignments.scopeId, p.id))),
        db.select({ id: commissionPlans.id, name: commissionPlans.name }).from(commissionPlans).orderBy(asc(commissionPlans.name)),
      ]);
      return {
        effective: resolved ? { planId: resolved.plan.id, name: resolved.plan.name, via: resolved.via } : null,
        overridePlanId: override?.planId ?? null,
        plans,
      };
    },

    /** The partner's commission rules in plain language, using partner-facing customer-type wording. */
    async partnerRateCard(partnerId: string): Promise<RateCard> {
      const [p] = await db.select().from(partners).where(eq(partners.id, partnerId));
      if (!p) throw notFound('Partner not found');
      const [s, names] = await Promise.all([loadSettings(db), categoryNames()]);
      const resolved = await resolvePlan(p.id, p.partnerTypeId, istDate(now()));
      const rules = resolved ? await rulesOf(resolved.plan.id) : [];
      const seen = new Set<string>();
      const lines = rules
        .map((r) => ({
          product: r.categoryId ? (names.get(r.categoryId) ?? 'Other') : 'Any product',
          customer: r.customerType ? s.customer_type_labels[r.customerType] : null,
          rate: r.rateType === 'percent' ? `${(r.rateValue / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}% of the product value (before GST)` : `${formatINR(r.rateValue)} per sale`,
          limits: [r.minPaise !== null ? `at least ${formatINR(r.minPaise)}` : null, r.maxPaise !== null ? `at most ${formatINR(r.maxPaise)}` : null].filter(Boolean).join(', ') || null,
        }))
        .filter((l) => {
          const key = JSON.stringify(l);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => a.product.localeCompare(b.product) || (a.customer ?? '').localeCompare(b.customer ?? ''));
      const notes = [
        s.commissionable_sales_per_lead === 1
          ? "Commission is paid on the customer's first purchase."
          : `Commission is paid on the customer's first ${s.commissionable_sales_per_lead} purchases.`,
        `A customer is credited to you for ${s.ownership_window_days} days after they confirm.`,
        ...(s.hold_days > 0 ? [`Commission becomes payable ${s.hold_days} days after the sale, to allow for returns.`] : []),
        `Payouts start from ${formatINR(s.min_payout_paise)}; smaller amounts roll over.`,
        ...(s.tds_bps > 0 ? [`TDS of ${(s.tds_bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}% is deducted from payouts as per Income Tax rules.`] : []),
      ];
      return { planName: resolved?.plan.name ?? null, lines, notes };
    },

    /* ───────────── Settings: benefits ───────────── */

    async listBenefits() {
      const rows = await db.select().from(referralBenefits).orderBy(desc(referralBenefits.active), desc(referralBenefits.priority), asc(referralBenefits.name));
      return { items: rows.map(({ createdAt: _c, updatedAt: _u, ...b }) => b) };
    },

    async saveBenefit(actor: AdminActor, id: string | null, input: Record<string, unknown>) {
      requireAdminRole(actor);
      if (id) {
        const updated = await db.update(referralBenefits).set(input).where(eq(referralBenefits.id, id)).returning({ id: referralBenefits.id });
        if (updated.length === 0) throw notFound('Benefit not found');
      } else {
        const [b] = await db
          .insert(referralBenefits)
          .values(input as typeof referralBenefits.$inferInsert)
          .returning({ id: referralBenefits.id });
        id = b!.id;
      }
      await audit(db, actor, 'settings', id, 'benefit.saved', { after: input });
      return id;
    },

    /* ───────────── Settings: general ───────────── */

    /** Public: the support email shown on the privacy and account-deletion pages. */
    async publicContact() {
      return { supportEmail: (await loadSettings(db)).support_email };
    },

    async getSettings() {
      return { values: (await loadSettings(db)) as unknown as Record<string, unknown>, defaults: DEFAULT_SETTINGS as unknown as Record<string, unknown> };
    },

    async updateSettings(actor: AdminActor, input: Record<string, unknown>) {
      requireAdminRole(actor);
      const before = await loadSettings(db);
      const parsed = settingsSchema.partial().parse(input);
      await db.transaction(async (tx) => {
        for (const [key, value] of Object.entries(parsed)) {
          if (value === undefined) continue;
          await tx
            .insert(settingsTable)
            .values({ key, value, updatedBy: actor.adminUserId })
            .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedBy: actor.adminUserId, updatedAt: now() } });
        }
        await audit(tx, actor, 'settings', 'general', 'settings.updated', {
          before: Object.fromEntries(Object.keys(parsed).map((k) => [k, before[k as keyof typeof before]])),
          after: parsed,
        });
      });
    },
  };
}

export type CommissionService = ReturnType<typeof createCommissionService>;
