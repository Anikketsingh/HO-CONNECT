/**
 * Single source of truth for every enum in HO Connect.
 * The database (packages/db) builds its Postgres enums from these arrays,
 * and the API, dashboard and app import the same values and types.
 */

export const ADMIN_ROLES = ['admin', 'agent'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PARTNER_STATUSES = [
  'draft', // registering in the app, not yet submitted
  'submitted', // waiting for an agent to review
  'changes_requested', // agent asked for corrections / re-uploads
  'approved',
  'rejected',
  'suspended',
] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const PARTNER_USER_ROLES = ['owner', 'staff'] as const;
export type PartnerUserRole = (typeof PARTNER_USER_ROLES)[number];

export const DOCUMENT_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const PAYOUT_METHODS = ['upi', 'bank'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const LEAD_CHANNELS = ['assisted', 'qr', 'link'] as const;
export type LeadChannel = (typeof LEAD_CHANNELS)[number];

export const CONSENT_STATUSES = ['pending', 'confirmed', 'expired', 'withdrawn', 'not_required'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const CONSENT_METHODS = ['otp_sms', 'otp_whatsapp', 'link'] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const CUSTOMER_TYPES = ['new', 'existing_contact', 'existing_customer', 'invalid'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const PREFERRED_MODES = ['ec_visit', 'home_trial', 'video', 'ho_decides'] as const;
export type PreferredMode = (typeof PREFERRED_MODES)[number];

export const CONSULTATION_MODES = ['ec_visit', 'home_trial', 'video'] as const;
export type ConsultationMode = (typeof CONSULTATION_MODES)[number];

export const LEAD_STAGES = [
  'awaiting_consent',
  'consent_expired',
  'duplicate',
  'under_review',
  'verified',
  'in_touch',
  'consultation_booked',
  'consultation_done',
  'purchased',
  'unreachable',
  'closed_lost',
  'invalid',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_EVENT_TYPES = [
  'created',
  'consent_sent',
  'consent_confirmed',
  'consent_expired',
  'verified',
  'stage_changed',
  'note',
  'nudge_sent',
  'sale_recorded',
  'sale_updated',
] as const;
export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number];

export const ACTOR_TYPES = ['system', 'admin', 'partner', 'customer'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const SALE_SOURCES = ['manual', 'erp', 'shopify'] as const;
export type SaleSource = (typeof SALE_SOURCES)[number];

export const SALE_STATUSES = ['active', 'returned', 'cancelled'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

/** percent → rate_value is basis points (750 = 7.5%); flat → rate_value is paise. */
export const RATE_TYPES = ['percent', 'flat'] as const;
export type RateType = (typeof RATE_TYPES)[number];

export const PLAN_SCOPES = ['default', 'partner_type', 'partner'] as const;
export type PlanScope = (typeof PLAN_SCOPES)[number];

export const COMMISSION_STATUSES = [
  'pending', // inside the hold period
  'approvable', // hold period over, waiting for an admin
  'approved',
  'in_payout',
  'paid',
  'reversed', // sale returned / cancelled after commission was created
  'rejected', // admin decided not to pay (e.g. fraud)
] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export const PAYOUT_BATCH_STATUSES = ['draft', 'exported', 'completed', 'cancelled'] as const;
export type PayoutBatchStatus = (typeof PAYOUT_BATCH_STATUSES)[number];

export const PAYOUT_STATUSES = ['pending', 'paid', 'failed', 'cancelled'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const BENEFIT_TYPES = ['none', 'waive_trial_fee', 'percent_off', 'flat_off', 'free_addon', 'custom'] as const;
export type BenefitType = (typeof BENEFIT_TYPES)[number];

export const LEGAL_DOC_KINDS = ['partner_terms', 'customer_consent'] as const;
export type LegalDocKind = (typeof LEGAL_DOC_KINDS)[number];

export const BULK_JOB_KINDS = ['stage_update'] as const;
export type BulkJobKind = (typeof BULK_JOB_KINDS)[number];

export const BULK_JOB_STATUSES = ['previewed', 'applied', 'failed'] as const;
export type BulkJobStatus = (typeof BULK_JOB_STATUSES)[number];

export const MESSAGE_CHANNELS = ['sms', 'whatsapp', 'push'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
