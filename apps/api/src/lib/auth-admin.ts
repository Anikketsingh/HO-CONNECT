import { createClient, type User } from '@supabase/supabase-js';

/** Managing Supabase login accounts (needs the secret key; used only by the API). */
export interface AuthAdmin {
  /** Finds the email login, or creates it with the given password. `created` is false when it already existed. */
  findOrCreateEmailUser(email: string, password: string): Promise<{ id: string; created: boolean }>;
  deleteUser(authUserId: string): Promise<void>;
}

export function createSupabaseAuthAdmin(opts: { url: string; serviceKey: string }): AuthAdmin {
  const client = createClient(opts.url, opts.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  async function findByEmail(email: string): Promise<User | null> {
    for (let page = 1; ; page++) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(`Supabase: ${error.message}`);
      const hit = data.users.find((u) => u.email?.toLowerCase() === email);
      if (hit) return hit;
      if (data.users.length < 1000) return null;
    }
  }

  return {
    async findOrCreateEmailUser(email, password) {
      const existing = await findByEmail(email);
      if (existing) return { id: existing.id, created: false };
      const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`Supabase: ${error?.message ?? 'could not create the login'}`);
      return { id: data.user.id, created: true };
    },
    async deleteUser(authUserId) {
      const { error } = await client.auth.admin.deleteUser(authUserId);
      if (error) throw new Error(`Supabase: ${error.message}`);
    },
  };
}
