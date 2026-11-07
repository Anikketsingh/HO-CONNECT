import type { ConsultationMode, CustomerType, LeadStage } from './enums';

/**
 * Stage rules. Only the stages below can be set by hand (one lead or in bulk).
 * - awaiting_consent / consent_expired / duplicate / under_review: set by the system
 * - verified / invalid: set when an agent tags the customer type in the verification queue
 * - purchased: set when an agent records a sale
 */
export const AGENT_SETTABLE_STAGES = [
  'in_touch',
  'consultation_booked',
  'consultation_done',
  'unreachable',
  'closed_lost',
] as const satisfies readonly LeadStage[];
export type AgentSettableStage = (typeof AGENT_SETTABLE_STAGES)[number];

/** Stages from which an agent may move a lead by hand. `closed_lost` can be reopened. */
export const OPEN_PIPELINE_STAGES = [
  'verified',
  'in_touch',
  'consultation_booked',
  'consultation_done',
  'unreachable',
  'closed_lost',
] as const satisfies readonly LeadStage[];

/** Stages where the lead is finished and earns nothing. */
export const DEAD_STAGES = ['consent_expired', 'duplicate', 'invalid'] as const satisfies readonly LeadStage[];

export function isAgentSettableStage(stage: string): stage is AgentSettableStage {
  return (AGENT_SETTABLE_STAGES as readonly string[]).includes(stage);
}

export type StageChangeCheck =
  | { kind: 'ok' }
  | { kind: 'no_change' }
  | { kind: 'error'; reason: string };

export interface StageChangeInput {
  current: LeadStage;
  target: string;
  consultationMode?: ConsultationMode | null;
}

/**
 * Validates a manual stage change. Used by the API (enforcement) and the
 * dashboard (bulk-update preview), so both always agree.
 */
export function checkStageChange({ current, target, consultationMode }: StageChangeInput): StageChangeCheck {
  if (!isAgentSettableStage(target)) {
    return { kind: 'error', reason: `"${target}" can't be set by hand` };
  }
  if (current === target) {
    return target === 'consultation_booked' && consultationMode ? { kind: 'ok' } : { kind: 'no_change' };
  }
  if (!(OPEN_PIPELINE_STAGES as readonly string[]).includes(current)) {
    return { kind: 'error', reason: `lead is "${current}" and can't be moved by hand` };
  }
  if (target === 'consultation_booked' && !consultationMode) {
    return { kind: 'error', reason: 'consultation mode is required for "consultation_booked"' };
  }
  return { kind: 'ok' };
}

/** Default partner-facing stage labels. Admins can override them in Settings. */
export const DEFAULT_STAGE_LABELS: Record<LeadStage, string> = {
  awaiting_consent: 'Waiting for customer confirmation',
  consent_expired: 'Customer did not confirm',
  duplicate: 'Already referred',
  under_review: 'Confirmed – HO is reviewing',
  verified: 'Verified',
  in_touch: 'HO team in touch',
  consultation_booked: 'Consultation booked',
  consultation_done: 'Consultation done',
  purchased: 'Purchased',
  unreachable: "Couldn't reach customer",
  closed_lost: 'Closed – not interested',
  invalid: "Couldn't verify",
};

/**
 * Default partner-facing customer-type labels. Both "existing" types share a neutral
 * label so a partner never learns a person's purchase history (DPDP / privacy).
 */
export const DEFAULT_CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  new: 'New customer for HO',
  existing_contact: 'Already connected with HO',
  existing_customer: 'Already connected with HO',
  invalid: "Couldn't verify",
};

export const CONSULTATION_MODE_LABELS: Record<ConsultationMode, string> = {
  ec_visit: 'Experience Centre visit',
  home_trial: 'Home trial',
  video: 'Video consultation',
};
