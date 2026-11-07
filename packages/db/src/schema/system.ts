import { bigserial, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tsz, updatedAt } from './_columns';
import { adminUsers } from './admin';
import { actorType, bulkJobKind, bulkJobStatus, legalDocKind, messageChannel } from './enums';
import { leads } from './leads';
import { partnerUsers } from './partners';

/** Global settings, one row per key. Shape and defaults live in @hoc/shared/settings. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => adminUsers.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Versioned partner T&C and customer consent text. Acceptances store the version. */
export const legalDocuments = pgTable(
  'legal_documents',
  {
    id: id(),
    kind: legalDocKind('kind').notNull(),
    version: text('version').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    publishedAt: tsz('published_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('legal_documents_kind_version_uq').on(t.kind, t.version)],
);

/** SMS / WhatsApp message templates (consent OTP, welcome, nudge). */
export const messageTemplates = pgTable('message_templates', {
  key: text('key').primaryKey(),
  channel: messageChannel('channel').notNull(),
  /** Body with {{placeholders}}. Must match the DLT / WhatsApp-approved template. */
  body: text('body').notNull(),
  /** Provider-side template id (DLT template id / WhatsApp template name). */
  providerTemplateId: text('provider_template_id'),
  updatedAt: updatedAt(),
});

/** Every message sent, for support and debugging. */
export const messageLog = pgTable(
  'message_log',
  {
    id: id(),
    channel: messageChannel('channel').notNull(),
    toPhone: text('to_phone'),
    templateKey: text('template_key'),
    leadId: uuid('lead_id').references(() => leads.id),
    status: text('status').notNull(),
    providerRef: text('provider_ref'),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('message_log_lead_idx').on(t.leadId)],
);

export const pushTokens = pgTable('push_tokens', {
  id: id(),
  partnerUserId: uuid('partner_user_id')
    .notNull()
    .references(() => partnerUsers.id),
  token: text('token').notNull().unique(),
  platform: text('platform').notNull(),
  createdAt: createdAt(),
  lastSeenAt: tsz('last_seen_at').notNull().defaultNow(),
});

export interface BulkJobRowRecord {
  row: number;
  leadId: string | null;
  ref: string | null;
  customerName: string | null;
  currentStage: string | null;
  stage: string | null;
  consultationMode: string | null;
  consultationAt: string | null;
  note: string | null;
  outcome: 'valid' | 'no_change' | 'invalid' | 'applied' | 'skipped';
  reason: string | null;
}

/** Bulk stage updates (list selection or CSV). Results are kept per row. */
export const bulkJobs = pgTable('bulk_jobs', {
  id: id(),
  kind: bulkJobKind('kind').notNull(),
  status: bulkJobStatus('status').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => adminUsers.id),
  fileName: text('file_name'),
  totalRows: integer('total_rows').notNull(),
  appliedRows: integer('applied_rows').notNull().default(0),
  errorRows: integer('error_rows').notNull().default(0),
  /** One entry per row: the preview outcome, then the applied outcome. Holds what is needed to apply it. */
  results: jsonb('results').$type<BulkJobRowRecord[]>(),
  createdAt: createdAt(),
  appliedAt: tsz('applied_at'),
});

/** Who changed what, when, and why. Written for every manual change in the dashboard. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorType: actorType('actor_type').notNull(),
    actorId: uuid('actor_id'),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_entity_idx').on(t.entity, t.entityId), index('audit_log_created_idx').on(t.createdAt)],
);
