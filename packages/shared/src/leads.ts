import { z } from 'zod';
import {
  COMMISSION_STATUSES,
  CONSULTATION_MODES,
  CUSTOMER_TYPES,
  LEAD_STAGES,
  PREFERRED_MODES,
  type LeadStage,
  type PreferredMode,
} from './enums';
import { PINCODE_REGEX } from './partners';
import { normalizeIndianMobile } from './phone';
import { AGENT_SETTABLE_STAGES } from './stages';

/* ───────────────────────── Stage groups ───────────────────────── */

/** Partner app filters. */
export const PARTNER_LEAD_FILTERS = {
  waiting: ['awaiting_consent'],
  active: ['under_review', 'verified', 'in_touch', 'consultation_booked', 'consultation_done', 'unreachable'],
  purchased: ['purchased'],
  closed: ['closed_lost', 'consent_expired', 'duplicate', 'invalid'],
} as const satisfies Record<string, readonly LeadStage[]>;
export type PartnerLeadFilter = keyof typeof PARTNER_LEAD_FILTERS | 'all';

/** Dashboard views. */
export const ADMIN_LEAD_VIEWS = {
  verify: ['under_review'],
  open: ['verified', 'in_touch', 'consultation_booked', 'consultation_done', 'unreachable'],
  awaiting: ['awaiting_consent'],
  purchased: ['purchased'],
  closed: ['closed_lost', 'consent_expired', 'duplicate', 'invalid'],
} as const satisfies Record<string, readonly LeadStage[]>;
export type AdminLeadView = keyof typeof ADMIN_LEAD_VIEWS | 'all';
export const ADMIN_LEAD_VIEW_KEYS = ['verify', 'open', 'awaiting', 'purchased', 'closed', 'all'] as const;

export const PREFERRED_MODE_LABELS: Record<PreferredMode, string> = {
  ec_visit: 'Visit an Experience Centre',
  home_trial: 'Home trial',
  video: 'Video consultation',
  ho_decides: 'Let HairOriginals decide',
};

/* ───────────────────────── Partner: add a lead ───────────────────────── */

export const leadInputSchema = z
  .object({
    customerName: z.string().trim().min(2, "Enter the customer's name").max(80, 'Name is too long'),
    customerPhone: z
      .string()
      .transform((v, ctx) => {
        const n = normalizeIndianMobile(v);
        if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number' });
        return n ?? '';
      }),
    categoryIds: z.array(z.uuid()).min(1, 'Choose what the customer is interested in').max(8),
    city: z.string().trim().max(60).optional().transform((v) => v || null),
    pincode: z
      .union([z.literal(''), z.string().trim().regex(PINCODE_REGEX, 'Enter a 6-digit pincode')])
      .optional()
      .transform((v) => v || null),
    preferredMode: z.enum(PREFERRED_MODES).default('ho_decides'),
    preferredCentreId: z.uuid().nullish(),
    notes: z.string().trim().max(500, 'Keep notes under 500 characters').optional().transform((v) => v || null),
  })
  .refine((v) => v.preferredMode !== 'ec_visit' || !!v.preferredCentreId, {
    message: 'Choose the experience centre',
    path: ['preferredCentreId'],
  });
export type LeadInput = z.input<typeof leadInputSchema>;

export const consentCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const leadOptionsSchema = z.object({
  categories: z.array(z.object({ id: z.uuid(), name: z.string() })),
  centres: z.array(z.object({ id: z.uuid(), name: z.string(), city: z.string() })),
  preferredModes: z.array(z.object({ value: z.enum(PREFERRED_MODES), label: z.string() })),
  /** What to tell the customer, if a referral benefit is running. */
  benefit: z.object({ partnerText: z.string().nullable(), customerText: z.string() }).nullable(),
  requireOtp: z.boolean(),
  dailyLimit: z.number().int(),
  addedToday: z.number().int(),
});
export type LeadOptions = z.infer<typeof leadOptionsSchema>;

/** A lead as a partner sees it: masked customer, partner-facing labels, no internal notes. */
export const partnerLeadSchema = z.object({
  id: z.uuid(),
  ref: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  stage: z.enum(LEAD_STAGES),
  stageLabel: z.string(),
  customerTypeLabel: z.string().nullable(),
  consultation: z.object({ mode: z.enum(CONSULTATION_MODES), modeLabel: z.string(), at: z.string().nullable() }).nullable(),
  /** "Commission ₹2,500 pending" once a sale is recorded. */
  commission: z.object({ amountPaise: z.number().int(), status: z.enum(COMMISSION_STATUSES), label: z.string() }).nullable(),
  createdAt: z.string(),
  stageChangedAt: z.string(),
});
export type PartnerLead = z.infer<typeof partnerLeadSchema>;

export const partnerLeadListSchema = z.object({
  items: z.array(partnerLeadSchema),
  counts: z.object({ all: z.number(), waiting: z.number(), active: z.number(), purchased: z.number(), closed: z.number() }),
  page: z.number().int(),
  hasMore: z.boolean(),
});

export const partnerLeadDetailSchema = partnerLeadSchema.extend({
  interests: z.array(z.string()),
  preferredModeLabel: z.string(),
  preferredCentre: z.string().nullable(),
  benefitText: z.string().nullable(),
  ownedUntil: z.string().nullable(),
  consent: z.object({
    pending: z.boolean(),
    expiresAt: z.string().nullable(),
    canResend: z.boolean(),
    resendsLeft: z.number().int(),
  }),
  timeline: z.array(z.object({ label: z.string(), detail: z.string().nullable(), at: z.string() })),
  /** The reminder SMS for an unreachable customer. `reason` explains a pause; null with available=false means "don't show it". */
  nudge: z.object({ available: z.boolean(), reason: z.string().nullable() }),
});
export type PartnerLeadDetail = z.infer<typeof partnerLeadDetailSchema>;

export const createLeadResponseSchema = z.object({
  lead: partnerLeadDetailSchema,
  smsSent: z.boolean(),
  /** Only in development with the console SMS provider, so the flow can be tested without SMS. */
  devCode: z.string().optional(),
});

export const resendResponseSchema = z.object({ smsSent: z.literal(true), devCode: z.string().optional() });

/* ───────────────────────── Dashboard ───────────────────────── */

export const adminLeadListQuerySchema = z.object({
  view: z.enum(ADMIN_LEAD_VIEW_KEYS).default('verify'),
  q: z.string().trim().max(100).optional(),
  partnerId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const adminLeadRowSchema = z.object({
  id: z.uuid(),
  ref: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  city: z.string().nullable(),
  stage: z.enum(LEAD_STAGES),
  customerType: z.enum(CUSTOMER_TYPES).nullable(),
  partner: z.object({ id: z.uuid(), name: z.string(), code: z.string().nullable() }),
  preferredMode: z.enum(PREFERRED_MODES),
  consultation: z.object({ mode: z.enum(CONSULTATION_MODES), at: z.string().nullable() }).nullable(),
  createdAt: z.string(),
  consentConfirmedAt: z.string().nullable(),
  stageChangedAt: z.string(),
});
export type AdminLeadRow = z.infer<typeof adminLeadRowSchema>;

export const adminLeadListSchema = z.object({
  items: z.array(adminLeadRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  counts: z.record(z.enum(ADMIN_LEAD_VIEW_KEYS), z.number().int()),
});
export type AdminLeadList = z.infer<typeof adminLeadListSchema>;

export const adminLeadDetailSchema = adminLeadRowSchema.extend({
  pincode: z.string().nullable(),
  interests: z.array(z.string()),
  preferredCentre: z.string().nullable(),
  notes: z.string().nullable(),
  crmRef: z.string().nullable(),
  ownedUntil: z.string().nullable(),
  benefit: z.object({ name: z.string(), customerText: z.string() }).nullable(),
  consentStatus: z.string(),
  verifiedBy: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  duplicateOf: z.object({ id: z.uuid(), ref: z.string() }).nullable(),
  sales: z.array(
    z.object({
      id: z.uuid(),
      saleDate: z.string(),
      invoiceNo: z.string().nullable(),
      totalNetPaise: z.number().int(),
      status: z.string(),
      commission: z.object({ id: z.uuid(), status: z.enum(COMMISSION_STATUSES), amountPaise: z.number().int(), flagged: z.boolean() }).nullable(),
    }),
  ),
  consents: z.array(
    z.object({
      method: z.string(),
      textVersion: z.string(),
      sentAt: z.string(),
      verifiedAt: z.string().nullable(),
      attempts: z.number().int(),
      ip: z.string().nullable(),
    }),
  ),
  samePhone: z.array(z.object({ id: z.uuid(), ref: z.string(), partner: z.string(), stage: z.enum(LEAD_STAGES), createdAt: z.string() })),
  events: z.array(
    z.object({
      type: z.string(),
      actor: z.string(),
      fromStage: z.enum(LEAD_STAGES).nullable(),
      toStage: z.enum(LEAD_STAGES).nullable(),
      note: z.string().nullable(),
      visibleToPartner: z.boolean(),
      meta: z.record(z.string(), z.unknown()).nullable(),
      at: z.string(),
    }),
  ),
});
export type AdminLeadDetail = z.infer<typeof adminLeadDetailSchema>;

export const verifyLeadSchema = z.object({
  customerType: z.enum(CUSTOMER_TYPES),
  crmRef: z.string().trim().max(60).optional().transform((v) => v || null),
  note: z.string().trim().max(1000).optional().transform((v) => v || null),
});

const consultationAt = z.iso.datetime({ offset: true }).nullish();

export const stageChangeSchema = z.object({
  stage: z.enum(AGENT_SETTABLE_STAGES),
  consultationMode: z.enum(CONSULTATION_MODES).nullish(),
  consultationAt,
  note: z.string().trim().max(1000).optional().transform((v) => v || null),
});
export type StageChangeBody = z.input<typeof stageChangeSchema>;

export const leadNoteSchema = z.object({ note: z.string().trim().min(1).max(2000) });

export const bulkStageSchema = stageChangeSchema.extend({
  leadIds: z.array(z.uuid()).min(1).max(500),
});

export const BULK_OUTCOMES = ['valid', 'no_change', 'invalid', 'applied', 'skipped'] as const;

export const bulkRowSchema = z.object({
  row: z.number().int(),
  leadId: z.uuid().nullable(),
  ref: z.string().nullable(),
  customerName: z.string().nullable(),
  currentStage: z.enum(LEAD_STAGES).nullable(),
  stage: z.string().nullable(),
  outcome: z.enum(BULK_OUTCOMES),
  reason: z.string().nullable(),
});
export type BulkRow = z.infer<typeof bulkRowSchema>;

export const bulkJobSchema = z.object({
  id: z.uuid(),
  status: z.enum(['previewed', 'applied', 'failed']),
  fileName: z.string().nullable(),
  totalRows: z.number().int(),
  appliedRows: z.number().int(),
  errorRows: z.number().int(),
  rows: z.array(bulkRowSchema),
  createdAt: z.string(),
});
export type BulkJob = z.infer<typeof bulkJobSchema>;

export const csvPreviewSchema = z.object({
  fileName: z.string().max(200).nullish(),
  csv: z.string().min(1, 'The file is empty').max(1_000_000, 'The file is too large (1 MB max)'),
});

export const BULK_CSV_TEMPLATE =
  'lead_ref,phone,stage,consultation_mode,consultation_at,note\n' +
  'L-000123,,in_touch,,,Called and spoke to the customer\n' +
  ',9876543210,consultation_booked,ec_visit,2026-11-20 16:30,Booked at Lajpat Nagar\n';

export const stageChangeResultSchema = z.object({ changed: z.boolean() });
