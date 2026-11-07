import { z } from 'zod';
import { PAYOUT_BATCH_STATUSES, PAYOUT_STATUSES } from './enums';

/* Payout batches (dashboard). Money is in paise. */

export const batchInputSchema = z.object({ label: z.string().trim().min(2, 'Name the batch, e.g. "November 2026"').max(60) });

export const markPaidSchema = z.object({
  utr: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9/_-]{4,40}$/, 'Enter the bank reference (UTR): letters and numbers, 4–40 characters'),
});

export const markFailedSchema = z.object({
  reason: z.string().trim().min(5, 'Say what went wrong (at least 5 characters)').max(300),
});

const money = z.number().int();

export const payoutPlanSchema = z.object({
  items: z.array(
    z.object({
      partnerId: z.uuid(),
      name: z.string(),
      code: z.string().nullable(),
      payoutDisplay: z.string().nullable(),
      commissionCount: z.number().int(),
      grossPaise: money,
      clawbackPaise: money,
      tdsPaise: money,
      netPaise: money,
    }),
  ),
  /** Partners with money waiting who are not in this batch, and why. */
  skipped: z.array(z.object({ partnerId: z.uuid(), name: z.string(), code: z.string().nullable(), reason: z.string(), waitingPaise: money })),
  totals: z.object({ grossPaise: money, clawbackPaise: money, tdsPaise: money, netPaise: money }),
  tdsBps: z.number().int(),
  minPayoutPaise: money,
});
export type PayoutPlan = z.infer<typeof payoutPlanSchema>;

export const batchSummarySchema = z.object({
  id: z.uuid(),
  label: z.string(),
  status: z.enum(PAYOUT_BATCH_STATUSES),
  createdAt: z.string(),
  exportedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  payoutCount: z.number().int(),
  paidCount: z.number().int(),
  netPaise: money,
});
export const batchListSchema = z.object({ items: z.array(batchSummarySchema) });
export type BatchSummary = z.infer<typeof batchSummarySchema>;

export const payoutRowSchema = z.object({
  id: z.uuid(),
  partner: z.object({ id: z.uuid(), name: z.string(), code: z.string().nullable() }),
  payoutDisplay: z.string().nullable(),
  commissionCount: z.number().int(),
  grossPaise: money,
  clawbackPaise: money,
  tdsPaise: money,
  netPaise: money,
  status: z.enum(PAYOUT_STATUSES),
  utr: z.string().nullable(),
  paidAt: z.string().nullable(),
  failureReason: z.string().nullable(),
});
export const batchDetailSchema = batchSummarySchema.extend({ payouts: z.array(payoutRowSchema) });
export type BatchDetail = z.infer<typeof batchDetailSchema>;

export const createdIdSchema = z.object({ id: z.uuid() });
