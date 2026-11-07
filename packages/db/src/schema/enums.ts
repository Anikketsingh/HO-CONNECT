import { pgEnum } from 'drizzle-orm/pg-core';
import {
  ACTOR_TYPES,
  ADMIN_ROLES,
  BENEFIT_TYPES,
  BULK_JOB_KINDS,
  BULK_JOB_STATUSES,
  COMMISSION_STATUSES,
  CONSENT_METHODS,
  CONSENT_STATUSES,
  CONSULTATION_MODES,
  CUSTOMER_TYPES,
  DOCUMENT_STATUSES,
  LEAD_CHANNELS,
  LEAD_EVENT_TYPES,
  LEAD_STAGES,
  LEGAL_DOC_KINDS,
  MESSAGE_CHANNELS,
  PARTNER_STATUSES,
  PARTNER_USER_ROLES,
  PAYOUT_BATCH_STATUSES,
  PAYOUT_METHODS,
  PAYOUT_STATUSES,
  PLAN_SCOPES,
  PREFERRED_MODES,
  RATE_TYPES,
  SALE_SOURCES,
  SALE_STATUSES,
} from '@hoc/shared';

export const adminRole = pgEnum('admin_role', ADMIN_ROLES);
export const partnerStatus = pgEnum('partner_status', PARTNER_STATUSES);
export const partnerUserRole = pgEnum('partner_user_role', PARTNER_USER_ROLES);
export const documentStatus = pgEnum('document_status', DOCUMENT_STATUSES);
export const payoutMethod = pgEnum('payout_method', PAYOUT_METHODS);
export const leadChannel = pgEnum('lead_channel', LEAD_CHANNELS);
export const consentStatus = pgEnum('consent_status', CONSENT_STATUSES);
export const consentMethod = pgEnum('consent_method', CONSENT_METHODS);
export const customerType = pgEnum('customer_type', CUSTOMER_TYPES);
export const preferredMode = pgEnum('preferred_mode', PREFERRED_MODES);
export const consultationMode = pgEnum('consultation_mode', CONSULTATION_MODES);
export const leadStage = pgEnum('lead_stage', LEAD_STAGES);
export const leadEventType = pgEnum('lead_event_type', LEAD_EVENT_TYPES);
export const actorType = pgEnum('actor_type', ACTOR_TYPES);
export const saleSource = pgEnum('sale_source', SALE_SOURCES);
export const saleStatus = pgEnum('sale_status', SALE_STATUSES);
export const rateType = pgEnum('rate_type', RATE_TYPES);
export const planScope = pgEnum('plan_scope', PLAN_SCOPES);
export const commissionStatus = pgEnum('commission_status', COMMISSION_STATUSES);
export const payoutBatchStatus = pgEnum('payout_batch_status', PAYOUT_BATCH_STATUSES);
export const payoutStatus = pgEnum('payout_status', PAYOUT_STATUSES);
export const benefitType = pgEnum('benefit_type', BENEFIT_TYPES);
export const legalDocKind = pgEnum('legal_doc_kind', LEGAL_DOC_KINDS);
export const bulkJobKind = pgEnum('bulk_job_kind', BULK_JOB_KINDS);
export const bulkJobStatus = pgEnum('bulk_job_status', BULK_JOB_STATUSES);
export const messageChannel = pgEnum('message_channel', MESSAGE_CHANNELS);
