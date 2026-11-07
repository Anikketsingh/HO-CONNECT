import { centres, commissionEntries, leads, partners, type Db } from '@hoc/db';
import { DEAD_STAGES, type AdminOverview } from '@hoc/shared';
import { eq, sql } from 'drizzle-orm';

export type OverviewQuery = () => Promise<AdminOverview>;

/** Stages where a lead is finished: bought, lost, or never became a real lead. */
const FINISHED_STAGES = ['purchased', 'closed_lost', ...DEAD_STAGES] as const;
// Constants from our own code, not user input, so inlining them is safe.
const finishedList = sql.raw(FINISHED_STAGES.map((s) => `'${s}'`).join(', '));

export function createOverviewQuery(db: Db): OverviewQuery {
  return async () => {
    const [[p], [l], [c], [m]] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          awaitingReview: sql<number>`(count(*) filter (where ${partners.status} = 'submitted'))::int`,
          approved: sql<number>`(count(*) filter (where ${partners.status} = 'approved'))::int`,
          deletionRequests: sql<number>`(count(*) filter (where ${partners.deletionRequestedAt} is not null and ${partners.closedAt} is null))::int`,
        })
        .from(partners),
      db
        .select({
          total: sql<number>`count(*)::int`,
          toVerify: sql<number>`(count(*) filter (where ${leads.stage} = 'under_review'))::int`,
          active: sql<number>`(count(*) filter (where ${leads.stage}::text not in (${finishedList})))::int`,
          purchased: sql<number>`(count(*) filter (where ${leads.stage} = 'purchased'))::int`,
        })
        .from(leads),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(centres)
        .where(eq(centres.active, true)),
      db
        .select({ toApprove: sql<number>`(count(*) filter (where ${commissionEntries.status} = 'approvable'))::int` })
        .from(commissionEntries),
    ]);
    return {
      partners: { total: p!.total, awaitingReview: p!.awaitingReview, approved: p!.approved, deletionRequests: p!.deletionRequests },
      commissions: { toApprove: m!.toApprove },
      leads: { total: l!.total, toVerify: l!.toVerify, active: l!.active, purchased: l!.purchased },
      centres: c!.total,
    };
  };
}
