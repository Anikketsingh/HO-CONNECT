import { z } from 'zod';
import {
  BENEFIT_TYPES,
  COMMISSION_STATUSES,
  CUSTOMER_TYPES,
  PLAN_SCOPES,
  RATE_TYPES,
  type CommissionStatus,
  type CustomerType,
  type RateType,
} from './enums';
import { applyBps, formatINR } from './money';

/* ───────────────────────── Engine (pure; used by the API and its tests) ───────────────────────── */

export interface EngineRule {
  id: string;
  categoryId: string | null;
  customerType: CustomerType | null;
  rateType: RateType;
  /** bps for percent, paise for flat. */
  rateValue: number;
  minPaise: number | null;
  maxPaise: number | null;
  priority: number;
}

export interface EngineLine {
  categoryId: string;
  netPaise: number;
}

export interface CalculatedLine extends EngineLine {
  rule: EngineRule | null;
  amountPaise: number;
}

/**
 * The rule for one sale line: the most specific match wins (category beats customer type beats "any"),
 * then the higher priority, then the rule id so the choice is always the same.
 */
export function pickRule(rules: readonly EngineRule[], categoryId: string, customerType: CustomerType): EngineRule | null {
  const specificity = (r: EngineRule) => (r.categoryId ? 2 : 0) + (r.customerType ? 1 : 0);
  const matches = rules.filter(
    (r) => (r.categoryId === null || r.categoryId === categoryId) && (r.customerType === null || r.customerType === customerType),
  );
  matches.sort((a, b) => specificity(b) - specificity(a) || b.priority - a.priority || a.id.localeCompare(b.id));
  return matches[0] ?? null;
}

/** Rate (or flat amount), then the rule's minimum and maximum. A zero-value line earns nothing. */
export function lineAmount(rule: EngineRule, netPaise: number): number {
  if (netPaise <= 0) return 0;
  let amount = rule.rateType === 'percent' ? applyBps(netPaise, rule.rateValue) : rule.rateValue;
  if (rule.minPaise !== null) amount = Math.max(amount, rule.minPaise);
  if (rule.maxPaise !== null) amount = Math.min(amount, rule.maxPaise);
  return Math.max(0, amount);
}

export function calculateCommission(rules: readonly EngineRule[], customerType: CustomerType, lines: readonly EngineLine[]) {
  const out: CalculatedLine[] = lines.map((l) => {
    const rule = pickRule(rules, l.categoryId, customerType);
    return { ...l, rule, amountPaise: rule ? lineAmount(rule, l.netPaise) : 0 };
  });
  return { lines: out, totalPaise: out.reduce((s, l) => s + l.amountPaise, 0) };
}

const CUSTOMER_TYPE_WORDS: Record<CustomerType, string> = {
  new: 'new customers',
  existing_contact: 'existing contacts',
  existing_customer: 'existing customers',
  invalid: 'invalid leads',
};

/** "7.5% of net value · Hair patches · new customers · min ₹500, max ₹5,000" */
export function describeRule(
  rule: Pick<EngineRule, 'rateType' | 'rateValue' | 'minPaise' | 'maxPaise' | 'customerType'>,
  categoryName: string | null,
): string {
  const rate =
    rule.rateType === 'percent'
      ? `${(rule.rateValue / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}% of net value`
      : `${formatINR(rule.rateValue)} flat`;
  const limits = [
    rule.minPaise !== null ? `min ${formatINR(rule.minPaise)}` : null,
    rule.maxPaise !== null ? `max ${formatINR(rule.maxPaise)}` : null,
  ].filter(Boolean);
  return [
    rate,
    categoryName ?? 'any product',
    rule.customerType ? CUSTOMER_TYPE_WORDS[rule.customerType] : 'any customer',
    limits.length ? limits.join(', ') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/* ───────────────────────── Flags and statuses ───────────────────────── */

export const FLAG_REASONS = {
  existing_customer_type: 'Customer was already connected with HO',
  linked_manually: 'Sale linked to the lead by hand',
  adjusted: 'Amount adjusted by an admin',
  no_rule: 'No commission rule matched a sale line',
  no_plan: 'No commission plan was in effect',
} as const;
export type FlagReason = keyof typeof FLAG_REASONS;

/** What partners see. "Approvable" is an internal step, so it reads as pending. */
export const PARTNER_COMMISSION_LABELS: Record<CommissionStatus, string> = {
  pending: 'pending',
  approvable: 'pending',
  approved: 'approved',
  in_payout: 'being paid',
  paid: 'paid',
  reversed: 'reversed',
  rejected: 'not payable',
};

export const COMMISSION_VIEWS = ['approvable', 'flagged', 'pending', 'approved', 'closed', 'all'] as const;
export type CommissionView = (typeof COMMISSION_VIEWS)[number];

/* ───────────────────────── Inputs ───────────────────────── */

const isoDate = z.iso.date({ error: 'Use a date like 2026-11-20' });
const paise = z.number().int().min(0).max(1_000_000_000);

export const planInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Name the plan').max(80),
    description: z.string().trim().max(300).nullish(),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullish(),
    active: z.boolean().optional(),
  })
  .refine((p) => !p.effectiveTo || p.effectiveTo >= p.effectiveFrom, {
    message: 'The end date must be after the start date',
    path: ['effectiveTo'],
  });
export const planUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).nullish(),
  effectiveFrom: isoDate.optional(),
  effectiveTo: isoDate.nullish(),
  active: z.boolean().optional(),
});

export const ruleInputSchema = z
  .object({
    categoryId: z.uuid().nullable(),
    customerType: z.enum(CUSTOMER_TYPES).exclude(['invalid']).nullable(),
    rateType: z.enum(RATE_TYPES),
    /** bps for percent (max 100%), paise for flat. */
    rateValue: z.number().int().min(0),
    minPaise: paise.nullable(),
    maxPaise: paise.nullable(),
    priority: z.number().int().min(0).max(1000).default(0),
  })
  .refine((r) => r.rateType !== 'percent' || r.rateValue <= 10_000, { message: 'A percentage can be at most 100%', path: ['rateValue'] })
  .refine((r) => r.rateType !== 'flat' || r.rateValue <= 100_000_000, { message: 'Flat amount is too large', path: ['rateValue'] })
  .refine((r) => r.minPaise === null || r.maxPaise === null || r.maxPaise >= r.minPaise, {
    message: 'The maximum must be at least the minimum',
    path: ['maxPaise'],
  });
export type RuleInput = z.input<typeof ruleInputSchema>;

export const planAssignmentSchema = z
  .object({
    scope: z.enum(PLAN_SCOPES),
    scopeId: z.uuid().nullable(),
    /** null removes the assignment (not allowed for the default). */
    planId: z.uuid().nullable(),
  })
  .refine((a) => (a.scope === 'default') === (a.scopeId === null), { message: 'scopeId is required except for the default' })
  .refine((a) => a.scope !== 'default' || a.planId !== null, { message: 'There must always be a default plan', path: ['planId'] });

export const saleInputSchema = z.object({
  saleDate: isoDate,
  invoiceNo: z.string().trim().max(60).optional().transform((v) => v || null),
  lines: z
    .array(z.object({ categoryId: z.uuid(), netPaise: paise.refine((v) => v > 0, 'Enter the net value') }))
    .min(1, 'Add at least one sale line')
    .max(20),
  /** The customer bought with another number or name, so an agent matched the sale by hand. */
  linkedManually: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
});
export type SaleInput = z.input<typeof saleInputSchema>;

export const adjustCommissionSchema = z.object({
  adjustmentPaise: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  reason: z.string().trim().min(5, 'Explain the adjustment (at least 5 characters)').max(500),
});
export const commissionReasonSchema = z.object({
  reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(500),
});
export const approveCommissionsSchema = z.object({ ids: z.array(z.uuid()).min(1).max(500) });

export const benefitInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(BENEFIT_TYPES),
  /** bps for percent_off, paise for flat_off. */
  value: z.number().int().min(0).max(100_000_000).nullable(),
  categoryIds: z.array(z.uuid()).default([]),
  cities: z.array(z.string().trim().min(2).max(60)).default([]),
  partnerTypeIds: z.array(z.uuid()).default([]),
  customerText: z.string().trim().min(5, 'Write what the customer sees').max(200),
  partnerText: z.string().trim().max(200).nullish(),
  activeFrom: isoDate.nullish(),
  activeTo: isoDate.nullish(),
  active: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
});
export type BenefitInput = z.input<typeof benefitInputSchema>;
/** PATCH body without defaults: zod applies defaults inside .partial(), which would reset untouched fields. */
export const benefitUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    type: z.enum(BENEFIT_TYPES),
    value: z.number().int().min(0).max(100_000_000).nullable(),
    categoryIds: z.array(z.uuid()),
    cities: z.array(z.string().trim().min(2).max(60)),
    partnerTypeIds: z.array(z.uuid()),
    customerText: z.string().trim().min(5).max(200),
    partnerText: z.string().trim().max(200).nullable(),
    activeFrom: isoDate.nullable(),
    activeTo: isoDate.nullable(),
    active: z.boolean(),
    priority: z.number().int().min(0).max(1000),
  })
  .partial();

/** Settings screen: current values and the defaults they override. */
export const settingsResponseSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  defaults: z.record(z.string(), z.unknown()),
});

/* ───────────────────────── Responses ───────────────────────── */

const ruleOutSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid().nullable(),
  customerType: z.enum(CUSTOMER_TYPES).nullable(),
  rateType: z.enum(RATE_TYPES),
  rateValue: z.number().int(),
  minPaise: z.number().int().nullable(),
  maxPaise: z.number().int().nullable(),
  priority: z.number().int(),
  description: z.string(),
});

export const planListSchema = z.object({
  plans: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      description: z.string().nullable(),
      effectiveFrom: z.string(),
      effectiveTo: z.string().nullable(),
      active: z.boolean(),
      rules: z.array(ruleOutSchema),
      assignedTo: z.array(z.object({ scope: z.enum(PLAN_SCOPES), scopeId: z.uuid().nullable(), label: z.string() })),
    }),
  ),
  categories: z.array(z.object({ id: z.uuid(), name: z.string() })),
  partnerTypes: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type PlanList = z.infer<typeof planListSchema>;

export const partnerPlanSchema = z.object({
  effective: z.object({ planId: z.uuid(), name: z.string(), via: z.enum(PLAN_SCOPES) }).nullable(),
  overridePlanId: z.uuid().nullable(),
  plans: z.array(z.object({ id: z.uuid(), name: z.string() })),
});

export const salePreviewSchema = z.object({
  eligible: z.boolean(),
  /** Why no commission will be created (the sale can still be recorded). */
  ineligibleReason: z.string().nullable(),
  plan: z.object({ id: z.uuid(), name: z.string(), via: z.enum(PLAN_SCOPES) }).nullable(),
  customerType: z.enum(CUSTOMER_TYPES),
  lines: z.array(
    z.object({
      categoryId: z.uuid(),
      categoryName: z.string(),
      netPaise: z.number().int(),
      rule: z.string().nullable(),
      amountPaise: z.number().int(),
    }),
  ),
  totalPaise: z.number().int(),
  flags: z.array(z.object({ key: z.string(), label: z.string() })),
  holdUntil: z.string().nullable(),
});
export type SalePreview = z.infer<typeof salePreviewSchema>;

export const recordSaleResultSchema = z.object({
  saleId: z.uuid(),
  commissionId: z.uuid().nullable(),
  preview: salePreviewSchema,
});

export const commissionRowSchema = z.object({
  id: z.uuid(),
  status: z.enum(COMMISSION_STATUSES),
  amountPaise: z.number().int(),
  calculatedPaise: z.number().int(),
  adjustmentPaise: z.number().int(),
  flagged: z.boolean(),
  flags: z.array(z.string()),
  holdUntil: z.string(),
  createdAt: z.string(),
  lead: z.object({ id: z.uuid(), ref: z.string(), customerName: z.string(), customerType: z.enum(CUSTOMER_TYPES).nullable() }),
  partner: z.object({ id: z.uuid(), name: z.string(), code: z.string().nullable() }),
  sale: z.object({ id: z.uuid(), saleDate: z.string(), invoiceNo: z.string().nullable(), totalNetPaise: z.number().int(), status: z.string() }),
});
export type CommissionRow = z.infer<typeof commissionRowSchema>;

export const commissionListSchema = z.object({
  items: z.array(commissionRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  counts: z.record(z.enum(COMMISSION_VIEWS), z.number().int()),
  sumPaise: z.number().int(),
});
export type CommissionList = z.infer<typeof commissionListSchema>;

export const commissionDetailSchema = commissionRowSchema.extend({
  adjustmentReason: z.string().nullable(),
  statusReason: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  snapshot: z.object({
    planName: z.string(),
    assignedVia: z.string(),
    customerType: z.string(),
    lines: z.array(z.object({ categoryName: z.string(), netPaise: z.number().int(), rule: z.string().nullable(), amountPaise: z.number().int() })),
  }),
  history: z.array(z.object({ action: z.string(), actor: z.string(), reason: z.string().nullable(), createdAt: z.string() })),
});
export type CommissionDetail = z.infer<typeof commissionDetailSchema>;

export const benefitListSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      type: z.enum(BENEFIT_TYPES),
      value: z.number().int().nullable(),
      categoryIds: z.array(z.uuid()),
      cities: z.array(z.string()),
      partnerTypeIds: z.array(z.uuid()),
      customerText: z.string(),
      partnerText: z.string().nullable(),
      activeFrom: z.string().nullable(),
      activeTo: z.string().nullable(),
      active: z.boolean(),
      priority: z.number().int(),
    }),
  ),
});
export type BenefitList = z.infer<typeof benefitListSchema>;

export const BENEFIT_TYPE_LABELS: Record<(typeof BENEFIT_TYPES)[number], string> = {
  none: 'No benefit',
  waive_trial_fee: 'Home-trial fee waived',
  percent_off: '% off',
  flat_off: '₹ off',
  free_addon: 'Free add-on',
  custom: 'Custom',
};

export const approveResultSchema = z.object({ approved: z.number().int(), skipped: z.number().int() });

export type PartnerPlan = z.infer<typeof partnerPlanSchema>;
