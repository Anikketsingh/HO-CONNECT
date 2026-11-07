import { randomBytes } from 'node:crypto';
import { adminUsers, auditLog, type Db } from '@hoc/db';
import type { AdminRole, TeamMember } from '@hoc/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { AuthAdmin } from '../lib/auth-admin';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../lib/errors';

export interface AdminActor {
  adminUserId: string;
  role: AdminRole;
}

/** Dashboard users: who can log in to HO Connect's dashboard, and as what. Admins only. */
export function createTeamService({ db, authAdmin }: { db: Db; authAdmin: AuthAdmin }) {
  const requireAdmin = (a: AdminActor) => {
    if (a.role !== 'admin') throw forbidden('forbidden', 'Only admins can manage the team.');
  };
  const audit = (a: AdminActor, id: string, action: string, after: unknown) =>
    db.insert(auditLog).values({ actorType: 'admin', actorId: a.adminUserId, entity: 'team', entityId: id, action, after: after as object });

  return {
    async list(actor: AdminActor): Promise<TeamMember[]> {
      requireAdmin(actor);
      const rows = await db.select().from(adminUsers).orderBy(asc(adminUsers.name));
      return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, active: r.active, isYou: r.id === actor.adminUserId, createdAt: r.createdAt.toISOString() }));
    },

    /** Creates the login and the dashboard user. A generated temporary password is returned once. */
    async create(actor: AdminActor, input: { name: string; email: string; role: AdminRole }) {
      requireAdmin(actor);
      const [dup] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, input.email));
      if (dup) throw conflict('duplicate', 'This email is already on the team.');
      const password = randomBytes(12).toString('base64url');
      const login = await authAdmin.findOrCreateEmailUser(input.email, password);
      try {
        const [row] = await db
          .insert(adminUsers)
          .values({ authUserId: login.id, email: input.email, name: input.name, role: input.role, active: true })
          .returning({ id: adminUsers.id });
        await audit(actor, row!.id, 'team.added', { email: input.email, role: input.role });
        return { id: row!.id, tempPassword: login.created ? password : null };
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('duplicate', 'This person is already on the team.');
        throw err;
      }
    },

    async update(actor: AdminActor, id: string, input: { name?: string; role?: AdminRole; active?: boolean }) {
      requireAdmin(actor);
      const [cur] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
      if (!cur) throw notFound('Team member not found');
      if (id === actor.adminUserId && (input.role === 'agent' || input.active === false)) {
        throw badRequest('self_change', "You can't remove your own admin access. Ask another admin.");
      }
      const losesAdmin = cur.role === 'admin' && cur.active && (input.role === 'agent' || input.active === false);
      if (losesAdmin) {
        const [{ n } = { n: 0 }] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(adminUsers)
          .where(and(eq(adminUsers.role, 'admin'), eq(adminUsers.active, true)));
        if (n <= 1) throw conflict('last_admin', 'There must always be at least one active admin.');
      }
      await db.update(adminUsers).set(input).where(eq(adminUsers.id, id));
      await audit(actor, id, 'team.updated', { before: { role: cur.role, active: cur.active }, after: input });
    },
  };
}

export type TeamService = ReturnType<typeof createTeamService>;
