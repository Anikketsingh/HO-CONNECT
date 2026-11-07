import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tsz, updatedAt } from './_columns';
import { adminUsers } from './admin';

/**
 * Custom QR codes for places that are not partners (HO stores, events, …), made in the dashboard.
 * Kinds, destinations and the link format live in @hoc/shared (qr-codes.ts).
 */
export const qrCodes = pgTable(
  'qr_codes',
  {
    id: id(),
    name: text('name').notNull(),
    /** Printed at the top of the poster. */
    label: text('label'),
    /** store | event | other */
    kind: text('kind').notNull(),
    /** tryon | url */
    destination: text('destination').notNull(),
    targetUrl: text('target_url'),
    utmSource: text('utm_source').notNull(),
    utmMedium: text('utm_medium').notNull(),
    utmCampaign: text('utm_campaign').notNull(),
    utmContent: text('utm_content'),
    /** The finished link the QR code opens. Fixed at creation: it may already be printed. */
    link: text('link').notNull(),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => adminUsers.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: tsz('archived_at'),
  },
  (t) => [index('qr_codes_created_idx').on(t.createdAt)],
);
