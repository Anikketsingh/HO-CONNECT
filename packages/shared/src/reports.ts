import { z } from 'zod';
import { ADMIN_ROLES, COMMISSION_STATUSES } from './enums';

/* Reports, pilot metrics, audit log and team (dashboard). */

const isoDate = z.iso.date({ error: 'Use a date like 2026-11-20' });
const int = z.number().int();

export const REPORT_GROUPS = ['partner', 'city', 'centre'] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

export const reportQuerySchema = z.object({
  /** India dates, both inclusive. Default: the last 30 days. */
  from: isoDate.optional(),
  to: isoDate.optional(),
  by: z.enum(REPORT_GROUPS).default('partner'),
});

export const funnelRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** Leads added in the period, and how many of them got this far (counted per lead, ever). */
  added: int,
  confirmed: int,
  verified: int,
  booked: int,
  consulted: int,
  purchased: int,
  commissionPaise: int,
});
export type FunnelRow = z.infer<typeof funnelRowSchema>;

export const funnelReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  by: z.enum(REPORT_GROUPS),
  rows: z.array(funnelRowSchema),
  totals: funnelRowSchema.omit({ key: true, label: true }),
});
export type FunnelReport = z.infer<typeof funnelReportSchema>;

const hours = z.object({ avg: z.number(), median: z.number(), p90: z.number() });

export const metricsSchema = z.object({
  from: z.string(),
  to: z.string(),
  days: int,
  partners: z.object({ approved: int, active: int }),
  leads: z.object({
    added: int,
    perActivePartnerPerWeek: z.number().nullable(),
    confirmed: int,
    consentRate: z.number().nullable(),
    verified: int,
    newCustomers: int,
    alreadyConnected: int,
    newShare: z.number().nullable(),
    purchased: int,
    purchaseConversion: z.number().nullable(),
  }),
  speed: z.object({
    waitingNow: int,
    oldestWaitingHours: z.number().nullable(),
    verifyWaitHours: hours.nullable(),
    firstContactHours: hours.nullable(),
  }),
  money: z.object({
    commissions: int,
    totalCommissionPaise: int,
    avgCommissionPaise: int.nullable(),
    paidOutPaise: int,
    avgDaysSaleToPayout: z.number().nullable(),
    byStatus: z.record(z.enum(COMMISSION_STATUSES), int),
  }),
  retention: z.object({ cohort: int, retained: int, rate: z.number().nullable() }),
});
export type Metrics = z.infer<typeof metricsSchema>;

/* Audit log */

export const auditQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  entity: z.string().trim().max(40).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export const auditListSchema = z.object({
  items: z.array(
    z.object({
      id: int,
      at: z.string(),
      actor: z.string(),
      actorType: z.string(),
      entity: z.string(),
      entityId: z.string(),
      action: z.string(),
      reason: z.string().nullable(),
      before: z.unknown().nullable(),
      after: z.unknown().nullable(),
    }),
  ),
  total: int,
  page: int,
  pageSize: int,
  entities: z.array(z.string()),
});
export type AuditList = z.infer<typeof auditListSchema>;

/* Team */

export const teamMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(ADMIN_ROLES),
  active: z.boolean(),
  isYou: z.boolean(),
  createdAt: z.string(),
});
export const teamListSchema = z.object({ items: z.array(teamMemberSchema) });
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamCreateSchema = z.object({
  name: z.string().trim().min(2, 'Enter their name').max(80),
  email: z.email('Enter a valid email').transform((v) => v.toLowerCase()),
  role: z.enum(ADMIN_ROLES),
});
export const teamCreateResponseSchema = z.object({
  id: z.uuid(),
  /** Shown once. Null when the person already had a login (they keep their password). */
  tempPassword: z.string().nullable(),
});
export const teamUpdateSchema = z
  .object({ name: z.string().trim().min(2).max(80), role: z.enum(ADMIN_ROLES), active: z.boolean() })
  .partial();

/* Privacy */

export const withdrawConsentSchema = z.object({ note: z.string().trim().min(5, 'Note how the customer asked (at least 5 characters)').max(500) });
export const closeAccountSchema = z.object({ note: z.string().trim().min(5, 'Add a short note (at least 5 characters)').max(500) });
