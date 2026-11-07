import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type { BenefitType } from '@hoc/shared';
import { createdAt, id, tsz, updatedAt } from './_columns';
import { adminUsers } from './admin';
import { centres } from './catalog';
import {
  actorType,
  benefitType,
  consentMethod,
  consentStatus,
  consultationMode,
  customerType,
  leadChannel,
  leadEventType,
  leadStage,
  preferredMode,
} from './enums';
import { partnerUsers, partners } from './partners';

/** Customer-facing offers for referred customers, configured in the dashboard. */
export const referralBenefits = pgTable('referral_benefits', {
  id: id(),
  name: text('name').notNull(),
  type: benefitType('type').notNull(),
  /** bps for percent_off, paise for flat_off, unused otherwise. */
  value: integer('value'),
  /** Empty array = applies to all. */
  categoryIds: uuid('category_ids').array().notNull().default(sql`'{}'::uuid[]`),
  cities: text('cities').array().notNull().default(sql`'{}'::text[]`),
  partnerTypeIds: uuid('partner_type_ids').array().notNull().default(sql`'{}'::uuid[]`),
  /** Shown to the customer (landing page, consent message). */
  customerText: text('customer_text').notNull(),
  /** Shown to the partner ("Tell your customer: …"). */
  partnerText: text('partner_text'),
  activeFrom: date('active_from'),
  activeTo: date('active_to'),
  active: boolean('active').notNull().default(true),
  /** Higher wins when several benefits match. */
  priority: integer('priority').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type BenefitSnapshot = {
  benefitId: string;
  name: string;
  type: BenefitType;
  value: number | null;
  customerText: string;
  partnerText: string | null;
};

export const leads = pgTable(
  'leads',
  {
    id: id(),
    /** Sequential number shown as "L-000123". */
    number: serial('number').notNull().unique(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id),
    /** Null for QR / link leads submitted by the customer. */
    createdByPartnerUserId: uuid('created_by_partner_user_id').references(() => partnerUsers.id),
    channel: leadChannel('channel').notNull(),

    customerName: text('customer_name').notNull(),
    /** Normalised 10-digit mobile: the join key with CRM / ERP. */
    customerPhone: varchar('customer_phone', { length: 10 }).notNull(),
    city: text('city'),
    pincode: varchar('pincode', { length: 6 }),
    categoryIds: uuid('category_ids').array().notNull().default(sql`'{}'::uuid[]`),
    preferredMode: preferredMode('preferred_mode').notNull().default('ho_decides'),
    preferredCentreId: uuid('preferred_centre_id').references(() => centres.id),
    /** Partner's note to HO. Visible in the dashboard only. */
    notes: text('notes'),

    consentStatus: consentStatus('consent_status').notNull().default('pending'),
    consentRequestedAt: tsz('consent_requested_at'),
    consentConfirmedAt: tsz('consent_confirmed_at'),
    consentExpiresAt: tsz('consent_expires_at'),

    /** Set by an agent in the verification queue. */
    customerType: customerType('customer_type'),
    verifiedBy: uuid('verified_by').references(() => adminUsers.id),
    verifiedAt: tsz('verified_at'),

    stage: leadStage('stage').notNull().default('awaiting_consent'),
    stageChangedAt: tsz('stage_changed_at').notNull().defaultNow(),
    consultationMode: consultationMode('consultation_mode'),
    consultationAt: tsz('consultation_at'),

    /** Partner owns the lead until this moment (consent time + ownership window). */
    ownedUntil: tsz('owned_until'),
    /** When a second partner submits a phone that is already owned. */
    duplicateOfLeadId: uuid('duplicate_of_lead_id').references((): AnyPgColumn => leads.id),

    benefitSnapshot: jsonb('benefit_snapshot').$type<BenefitSnapshot | null>(),

    /** MVP: no CRM connection. Agents may type in the CRM's lead id by hand. */
    crmRef: text('crm_ref'),
    /** Set when the customer withdrew consent and their name, phone and notes were erased. */
    personalDataErasedAt: tsz('personal_data_erased_at'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('leads_customer_phone_idx').on(t.customerPhone),
    index('leads_partner_idx').on(t.partnerId, t.createdAt),
    index('leads_stage_idx').on(t.stage, t.stageChangedAt),
  ],
);

/** Proof of the customer's consent (DPDP). One row per OTP / link sent. */
export const consentRecords = pgTable(
  'consent_records',
  {
    id: id(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    method: consentMethod('method').notNull(),
    consentTextVersion: text('consent_text_version').notNull(),
    /** SHA-256 of the OTP. The OTP itself is never stored. */
    otpHash: text('otp_hash'),
    expiresAt: tsz('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    verifiedAt: tsz('verified_at'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('consent_records_lead_idx').on(t.leadId)],
);

/** Timeline of everything that happened to a lead. */
export const leadEvents = pgTable(
  'lead_events',
  {
    id: id(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    type: leadEventType('type').notNull(),
    actorType: actorType('actor_type').notNull(),
    actorId: uuid('actor_id'),
    fromStage: leadStage('from_stage'),
    toStage: leadStage('to_stage'),
    /** Internal note; not shown to partners. */
    note: text('note'),
    /** Whether the partner sees this event in their timeline. */
    visibleToPartner: boolean('visible_to_partner').notNull().default(true),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('lead_events_lead_idx').on(t.leadId, t.createdAt)],
);
