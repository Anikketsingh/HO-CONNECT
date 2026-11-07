import { adminUsers, partnerUsers, partners, type Db } from '@hoc/db';
import type { AdminRole, PartnerStatus } from '@hoc/shared';
import { eq } from 'drizzle-orm';

export type Identity =
  | { kind: 'admin'; adminUserId: string; role: AdminRole; name: string; email: string; active: boolean }
  | { kind: 'partner'; partnerUserId: string; partnerId: string; partnerStatus: PartnerStatus; active: boolean }
  /** Logged in with Supabase but not yet linked to an admin or a partner (e.g. a partner mid-registration). */
  | { kind: 'unregistered' };

/** Maps a Supabase Auth user id to who they are in HO Connect. */
export type IdentityResolver = (authUserId: string) => Promise<Identity>;

export function createDbIdentityResolver(db: Db): IdentityResolver {
  return async (authUserId) => {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.authUserId, authUserId)).limit(1);
    if (admin) {
      return {
        kind: 'admin',
        adminUserId: admin.id,
        role: admin.role,
        name: admin.name,
        email: admin.email,
        active: admin.active,
      };
    }

    const [partnerUser] = await db
      .select({
        partnerUserId: partnerUsers.id,
        partnerId: partnerUsers.partnerId,
        active: partnerUsers.active,
        partnerStatus: partners.status,
      })
      .from(partnerUsers)
      .innerJoin(partners, eq(partners.id, partnerUsers.partnerId))
      .where(eq(partnerUsers.authUserId, authUserId))
      .limit(1);
    if (partnerUser) return { kind: 'partner', ...partnerUser };

    return { kind: 'unregistered' };
  };
}
