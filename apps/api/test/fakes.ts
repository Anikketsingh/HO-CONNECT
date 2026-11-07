import { randomUUID } from 'node:crypto';
import type { AuthAdmin } from '../src/lib/auth-admin';

/** In-memory stand-in for Supabase's login admin API. */
export function fakeAuthAdmin() {
  const users = new Map<string, string>(); // email → id
  const deleted: string[] = [];
  const admin: AuthAdmin = {
    async findOrCreateEmailUser(email) {
      const hit = users.get(email);
      if (hit) return { id: hit, created: false };
      const id = randomUUID();
      users.set(email, id);
      return { id, created: true };
    },
    async deleteUser(id) {
      deleted.push(id);
    },
  };
  return { admin, users, deleted };
}
