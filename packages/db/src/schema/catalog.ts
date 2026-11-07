import { boolean, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './_columns';

/** Experience Centres. HO Connect keeps the canonical list (editable in the dashboard). */
export const centres = pgTable('centres', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  region: text('region').notNull(),
  address: text('address'),
  pincode: text('pincode'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Product categories: used in the lead form ("interested in") and in commission rules. */
export const productCategories = pgTable('product_categories', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const products = pgTable('products', {
  id: id(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => productCategories.id),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
