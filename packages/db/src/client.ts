import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export interface CreateDbOptions {
  /** Max pool size. Keep small on Supabase poolers. */
  max?: number;
}

/**
 * Creates a Drizzle client. Works with Supabase's session pooler (5432) and
 * transaction pooler (6543); prepared statements are disabled because the
 * transaction pooler does not support them.
 */
export function createDb(databaseUrl: string, options: CreateDbOptions = {}) {
  const sql = postgres(databaseUrl, {
    max: options.max ?? 10,
    prepare: false,
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export type Db = ReturnType<typeof createDb>['db'];
