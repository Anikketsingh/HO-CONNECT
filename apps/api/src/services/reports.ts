import { adminUsers, auditLog, type Db } from '@hoc/db';
import type { AuditList, FunnelReport, Metrics, ReportGroup } from '@hoc/shared';
import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';

const AUDIT_PAGE = 50;
const DAY = 86400_000;

const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const round = (v: number | null, d = 1) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

type Row = Record<string, unknown>;

export function createReportService({ db, now = () => new Date() }: { db: Db; now?: () => Date }) {
  async function rows(q: SQL): Promise<Row[]> {
    return (await db.execute(q)) as unknown as Row[];
  }

  /** Default: the last 30 days, in India time. */
  function range(from?: string, to?: string) {
    const end = to ?? istDate(now());
    const start = from ?? addDays(end, -29);
    const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1);
    // India midnight, as instants. `to` is inclusive.
    const fromTs = sql`(${start}::date)::timestamp at time zone 'Asia/Kolkata'`;
    const toTs = sql`((${end}::date + 1)::timestamp at time zone 'Asia/Kolkata')`;
    return { from: start, to: end, days, fromTs, toTs };
  }

  return {
    /** Leads added in the period, and how far each got, grouped by partner, city or preferred centre. */
    async funnel(query: { from?: string; to?: string; by: ReportGroup }): Promise<FunnelReport> {
      const r = range(query.from, query.to);
      const key =
        query.by === 'partner'
          ? sql`b.partner_id::text`
          : query.by === 'city'
            ? sql`lower(btrim(coalesce(b.city, '')))`
            : sql`coalesce(b.preferred_centre_id::text, 'none')`;
      const label =
        query.by === 'partner'
          ? sql`coalesce(p.business_name, 'Partner')`
          : query.by === 'city'
            ? sql`coalesce(nullif(initcap(btrim(b.city)), ''), 'Not given')`
            : sql`coalesce(ce.name, 'No preference')`;
      const data = await rows(sql`
        with base as (
          select l.id, l.partner_id, l.city, l.preferred_centre_id, l.consent_confirmed_at, l.verified_at, l.customer_type,
            exists (select 1 from lead_events e where e.lead_id = l.id and e.to_stage = 'consultation_booked') as booked,
            exists (select 1 from lead_events e where e.lead_id = l.id and e.to_stage = 'consultation_done') as consulted,
            exists (select 1 from sales s where s.lead_id = l.id and s.status = 'active') as purchased,
            coalesce((select sum(c.amount_paise) from commission_entries c where c.lead_id = l.id and c.status not in ('reversed', 'rejected')), 0) as commission
          from leads l
          where l.created_at >= ${r.fromTs} and l.created_at < ${r.toTs}
        )
        select ${key} as key, min(${label}) as label,
          count(*)::int as added,
          (count(*) filter (where b.consent_confirmed_at is not null))::int as confirmed,
          (count(*) filter (where b.verified_at is not null and b.customer_type is distinct from 'invalid'))::int as verified,
          (count(*) filter (where b.booked))::int as booked,
          (count(*) filter (where b.consulted))::int as consulted,
          (count(*) filter (where b.purchased))::int as purchased,
          coalesce(sum(b.commission), 0)::bigint as commission
        from base b
        join partners p on p.id = b.partner_id
        left join centres ce on ce.id = b.preferred_centre_id
        group by 1
        order by purchased desc, added desc, label asc
      `);
      const out = data.map((d) => ({
        key: String(d.key),
        label: String(d.label),
        added: Number(d.added),
        confirmed: Number(d.confirmed),
        verified: Number(d.verified),
        booked: Number(d.booked),
        consulted: Number(d.consulted),
        purchased: Number(d.purchased),
        commissionPaise: Number(d.commission),
      }));
      const sum = (k: 'added' | 'confirmed' | 'verified' | 'booked' | 'consulted' | 'purchased' | 'commissionPaise') => out.reduce((t, x) => t + x[k], 0);
      return {
        from: r.from,
        to: r.to,
        by: query.by,
        rows: out,
        totals: { added: sum('added'), confirmed: sum('confirmed'), verified: sum('verified'), booked: sum('booked'), consulted: sum('consulted'), purchased: sum('purchased'), commissionPaise: sum('commissionPaise') },
      };
    },

    /** The pilot success metrics from the plan, for leads added in the period. */
    async metrics(query: { from?: string; to?: string }): Promise<Metrics> {
      const r = range(query.from, query.to);
      const hours = (a: string, b: string) => sql.raw(`extract(epoch from (${b} - ${a})) / 3600.0`);
      const [partnerRow, leadRow, waitRow, contactRow, nowRow, moneyRow, payRow, retRow, statusRows] = await Promise.all([
        rows(sql`
          select (select count(*) from partners where status = 'approved')::int as approved,
                 (select count(distinct partner_id) from leads where created_at >= ${r.fromTs} and created_at < ${r.toTs})::int as active`),
        rows(sql`
          select count(*)::int as added,
            (count(*) filter (where consent_confirmed_at is not null))::int as confirmed,
            (count(*) filter (where verified_at is not null and customer_type is distinct from 'invalid'))::int as verified,
            (count(*) filter (where customer_type = 'new'))::int as new_customers,
            (count(*) filter (where customer_type in ('existing_contact', 'existing_customer')))::int as connected,
            (count(*) filter (where exists (select 1 from sales s where s.lead_id = leads.id and s.status = 'active')))::int as purchased
          from leads where created_at >= ${r.fromTs} and created_at < ${r.toTs}`),
        rows(sql`
          select avg(${hours('consent_confirmed_at', 'verified_at')}) as avg,
                 percentile_cont(0.5) within group (order by ${hours('consent_confirmed_at', 'verified_at')}) as median,
                 percentile_cont(0.9) within group (order by ${hours('consent_confirmed_at', 'verified_at')}) as p90
          from leads where created_at >= ${r.fromTs} and created_at < ${r.toTs} and consent_confirmed_at is not null and verified_at is not null`),
        rows(sql`
          with firsts as (
            select l.consent_confirmed_at as c, (select min(e.created_at) from lead_events e where e.lead_id = l.id and e.type = 'stage_changed' and e.to_stage = 'in_touch') as t
            from leads l where l.created_at >= ${r.fromTs} and l.created_at < ${r.toTs} and l.consent_confirmed_at is not null
          )
          select avg(extract(epoch from (t - c)) / 3600.0) as avg,
                 percentile_cont(0.5) within group (order by extract(epoch from (t - c)) / 3600.0) as median,
                 percentile_cont(0.9) within group (order by extract(epoch from (t - c)) / 3600.0) as p90
          from firsts where t is not null`),
        rows(sql`
          select count(*)::int as waiting, max(extract(epoch from (now() - consent_confirmed_at)) / 3600.0) as oldest
          from leads where stage = 'under_review'`),
        rows(sql`
          select count(*)::int as n, coalesce(sum(amount_paise), 0)::bigint as total
          from commission_entries where created_at >= ${r.fromTs} and created_at < ${r.toTs} and status not in ('reversed', 'rejected')`),
        rows(sql`
          select coalesce((select sum(net_paise) from payouts where status = 'paid' and paid_at >= ${r.fromTs} and paid_at < ${r.toTs}), 0)::bigint as paid_out,
                 (select avg((p.paid_at at time zone 'Asia/Kolkata')::date - s.sale_date)
                    from commission_entries c join payouts p on p.id = c.payout_id join sales s on s.id = c.sale_id
                   where p.status = 'paid' and c.status = 'paid' and p.paid_at >= ${r.fromTs} and p.paid_at < ${r.toTs}) as days`),
        rows(sql`
          with cohort as (select id from partners where status = 'approved' and reviewed_at is not null and reviewed_at <= now() - interval '60 days')
          select (select count(*) from cohort)::int as cohort,
                 (select count(distinct l.partner_id) from leads l where l.partner_id in (select id from cohort) and l.created_at >= now() - interval '30 days')::int as retained`),
        rows(sql`
          select status, coalesce(sum(amount_paise), 0)::bigint as total from commission_entries
          where created_at >= ${r.fromTs} and created_at < ${r.toTs} group by status`),
      ]);

      const p = partnerRow[0]!;
      const l = leadRow[0]!;
      const added = Number(l.added);
      const verified = Number(l.verified);
      const typed = Number(l.new_customers) + Number(l.connected);
      const active = Number(p.active);
      const w = waitRow[0]!;
      const c = contactRow[0]!;
      const m = moneyRow[0]!;
      const ret = retRow[0]!;
      const byStatus: Metrics['money']['byStatus'] = { pending: 0, approvable: 0, approved: 0, in_payout: 0, paid: 0, reversed: 0, rejected: 0 };
      for (const s of statusRows) byStatus[s.status as keyof typeof byStatus] = Number(s.total);
      const h = (row: Row) =>
        row.avg === null || row.avg === undefined ? null : { avg: round(num(row.avg))!, median: round(num(row.median))!, p90: round(num(row.p90))! };
      const commissions = Number(m.n);
      const cohort = Number(ret.cohort);
      return {
        from: r.from,
        to: r.to,
        days: r.days,
        partners: { approved: Number(p.approved), active },
        leads: {
          added,
          perActivePartnerPerWeek: active ? round(added / active / (r.days / 7), 2) : null,
          confirmed: Number(l.confirmed),
          consentRate: added ? round(Number(l.confirmed) / added, 3) : null,
          verified,
          newCustomers: Number(l.new_customers),
          alreadyConnected: Number(l.connected),
          newShare: typed ? round(Number(l.new_customers) / typed, 3) : null,
          purchased: Number(l.purchased),
          purchaseConversion: verified ? round(Number(l.purchased) / verified, 3) : null,
        },
        speed: { waitingNow: Number(nowRow[0]!.waiting), oldestWaitingHours: round(num(nowRow[0]!.oldest)), verifyWaitHours: h(w), firstContactHours: h(c) },
        money: {
          commissions,
          totalCommissionPaise: Number(m.total),
          avgCommissionPaise: commissions ? Math.round(Number(m.total) / commissions) : null,
          paidOutPaise: Number(payRow[0]!.paid_out),
          avgDaysSaleToPayout: round(num(payRow[0]!.days)),
          byStatus,
        },
        retention: { cohort, retained: Number(ret.retained), rate: cohort ? round(Number(ret.retained) / cohort, 3) : null },
      };
    },

    async audit(query: { q?: string; entity?: string; from?: string; to?: string; page: number }): Promise<AuditList> {
      const conds: SQL[] = [];
      if (query.entity) conds.push(eq(auditLog.entity, query.entity));
      if (query.from) conds.push(gte(auditLog.createdAt, new Date(`${query.from}T00:00:00+05:30`)));
      if (query.to) conds.push(lt(auditLog.createdAt, new Date(Date.parse(`${query.to}T00:00:00+05:30`) + DAY)));
      if (query.q) {
        const term = `%${query.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
        conds.push(or(ilike(auditLog.action, term), ilike(auditLog.entityId, term), ilike(auditLog.reason, term))!);
      }
      const where = conds.length ? and(...conds) : undefined;
      const [items, [{ n } = { n: 0 }], entities] = await Promise.all([
        db
          .select({ a: auditLog, actorName: adminUsers.name })
          .from(auditLog)
          .leftJoin(adminUsers, eq(adminUsers.id, auditLog.actorId))
          .where(where)
          .orderBy(desc(auditLog.id))
          .limit(AUDIT_PAGE)
          .offset((query.page - 1) * AUDIT_PAGE),
        db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where),
        db.selectDistinct({ entity: auditLog.entity }).from(auditLog).orderBy(auditLog.entity),
      ]);
      return {
        items: items.map(({ a, actorName }) => ({
          id: a.id,
          at: a.createdAt.toISOString(),
          actor: a.actorType === 'admin' ? (actorName ?? 'HO team') : a.actorType === 'partner' ? 'Partner' : a.actorType === 'customer' ? 'Customer' : 'System',
          actorType: a.actorType,
          entity: a.entity,
          entityId: a.entityId,
          action: a.action,
          reason: a.reason,
          before: a.before,
          after: a.after,
        })),
        total: n,
        page: query.page,
        pageSize: AUDIT_PAGE,
        entities: entities.map((e) => e.entity),
      };
    },
  };
}

export type ReportService = ReturnType<typeof createReportService>;
