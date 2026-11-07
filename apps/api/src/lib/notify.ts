import { partnerUsers, pushTokens, type Db } from '@hoc/db';
import { and, eq, inArray } from 'drizzle-orm';
import type { PushSender } from './push';

export interface PartnerNotice {
  title: string;
  body: string;
  /** Opens this screen in the app when tapped, e.g. "/leads/<id>". */
  url?: string;
}

/** Tells a partner something. Never throws: a failed notification must not fail the request that caused it. */
export interface Notifier {
  toPartner(partnerId: string, notice: PartnerNotice): Promise<void>;
}

export const noopNotifier: Notifier = { async toPartner() {} };

export function createNotifier({ db, push, log }: { db: Db; push: PushSender; log: (msg: string, err?: unknown) => void }): Notifier {
  return {
    async toPartner(partnerId, notice) {
      try {
        const tokens = await db
          .select({ id: pushTokens.id, token: pushTokens.token })
          .from(pushTokens)
          .innerJoin(partnerUsers, eq(partnerUsers.id, pushTokens.partnerUserId))
          .where(and(eq(partnerUsers.partnerId, partnerId), eq(partnerUsers.active, true)));
        if (tokens.length === 0) return;
        const results = await push.send(
          tokens.map((t) => ({ to: t.token, title: notice.title, body: notice.body, data: notice.url ? { url: notice.url } : undefined })),
        );
        const dead = tokens.filter((_, i) => {
          const r = results[i];
          return r && !r.ok && r.invalidToken;
        });
        if (dead.length) {
          await db.delete(pushTokens).where(inArray(pushTokens.id, dead.map((d) => d.id)));
        }
        const failed = results.filter((r) => !r.ok && !r.invalidToken);
        if (failed.length) log(`push: ${failed.length} of ${results.length} failed`, failed[0]);
      } catch (err) {
        log('push: notification failed', err);
      }
    },
  };
}
