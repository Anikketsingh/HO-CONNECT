import { boolean, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './_columns';
import { adminRole } from './enums';

/** Dashboard users. `auth_user_id` is the Supabase Auth user (auth.users.id). */
export const adminUsers = pgTable('admin_users', {
  id: id(),
  authUserId: uuid('auth_user_id').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: adminRole('role').notNull().default('agent'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
