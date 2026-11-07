import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tsz, updatedAt } from './_columns';
import { adminUsers } from './admin';
import { centres } from './catalog';
import { documentStatus, partnerStatus, partnerUserRole, payoutMethod } from './enums';

/** Salon, Parlour, Freelancer, … (editable). Each type has its own document checklist. */
export const partnerTypes = pgTable('partner_types', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** The document checklist for a partner type (e.g. "Storefront photo", "PAN card"). */
export const documentTypes = pgTable(
  'document_types',
  {
    id: id(),
    partnerTypeId: uuid('partner_type_id')
      .notNull()
      .references(() => partnerTypes.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    required: boolean('required').notNull().default(true),
    acceptedMimeTypes: text('accepted_mime_types')
      .array()
      .notNull()
      .default(sql`ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]`),
    maxFiles: integer('max_files').notNull().default(1),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('document_types_type_slug_uq').on(t.partnerTypeId, t.slug)],
);

export const partners = pgTable(
  'partners',
  {
    id: id(),
    /** Issued on approval, e.g. "HOC00042". Printed on the QR poster. */
    code: text('code').unique(),
    partnerTypeId: uuid('partner_type_id')
      .notNull()
      .references(() => partnerTypes.id),
    businessName: text('business_name'),
    ownerName: text('owner_name'),
    /** Normalised 10-digit mobile of the owner. */
    phone: varchar('phone', { length: 10 }).notNull(),
    email: text('email'),
    addressLine: text('address_line'),
    city: text('city'),
    state: text('state'),
    pincode: varchar('pincode', { length: 6 }),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    homeCentreId: uuid('home_centre_id').references(() => centres.id),
    status: partnerStatus('status').notNull().default('draft'),

    /** AES-256-GCM ciphertext (see apps/api/src/lib/crypto.ts). Never returned to clients in full. */
    panEncrypted: text('pan_encrypted'),
    panLast4: varchar('pan_last4', { length: 4 }),
    gstin: varchar('gstin', { length: 15 }),
    payoutMethod: payoutMethod('payout_method'),
    /** Encrypted JSON: UPI id, or account holder / number / IFSC. */
    payoutDetailsEncrypted: text('payout_details_encrypted'),
    /** Safe display string, e.g. "UPI · priy•••@okhdfc" or "Bank · ••••4321". */
    payoutDisplay: text('payout_display'),

    agreementVersion: text('agreement_version'),
    agreementAcceptedAt: tsz('agreement_accepted_at'),
    submittedAt: tsz('submitted_at'),
    reviewedBy: uuid('reviewed_by').references(() => adminUsers.id),
    reviewedAt: tsz('reviewed_at'),
    /** Shown to the partner when changes are requested or the application is rejected. */
    reviewNote: text('review_note'),
    /** Internal notes, never shown to the partner. */
    internalNotes: text('internal_notes'),
    /** The partner asked to delete their account (Google Play requires an in-app way to ask). An admin closes it. */
    deletionRequestedAt: tsz('deletion_requested_at'),
    /** When an admin closed the account and removed personal data (financial records are kept). */
    closedAt: tsz('closed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('partners_phone_uq').on(t.phone),
    index('partners_status_idx').on(t.status),
    index('partners_city_idx').on(t.city),
  ],
);

/** People who log in to the app for a partner. MVP: one owner per partner. */
export const partnerUsers = pgTable(
  'partner_users',
  {
    id: id(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id),
    authUserId: uuid('auth_user_id').notNull().unique(),
    phone: varchar('phone', { length: 10 }).notNull().unique(),
    name: text('name'),
    role: partnerUserRole('role').notNull().default('owner'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('partner_users_partner_idx').on(t.partnerId)],
);

export const partnerDocuments = pgTable(
  'partner_documents',
  {
    id: id(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id),
    documentTypeId: uuid('document_type_id')
      .notNull()
      .references(() => documentTypes.id),
    /** Path inside the private Supabase Storage bucket `partner-documents`. */
    storagePath: text('storage_path').notNull().unique(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: documentStatus('status').notNull().default('pending'),
    reviewerNote: text('reviewer_note'),
    reviewedBy: uuid('reviewed_by').references(() => adminUsers.id),
    reviewedAt: tsz('reviewed_at'),
    /** Superseded uploads are kept for the audit trail but hidden. */
    replacedAt: tsz('replaced_at'),
    createdAt: createdAt(),
  },
  (t) => [index('partner_documents_partner_idx').on(t.partnerId)],
);
