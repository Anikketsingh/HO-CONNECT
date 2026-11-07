import { z } from 'zod';
import { COMMISSION_STATUSES } from './enums';

/* Partner app: earnings, rate card, share link, push token. */

const money = z.number().int();

export const earningsSchema = z.object({
  totals: z.object({ pendingPaise: money, approvedPaise: money, beingPaidPaise: money, paidPaise: money }),
  entries: z.array(
    z.object({
      id: z.uuid(),
      leadId: z.uuid(),
      ref: z.string(),
      customerName: z.string(),
      amountPaise: money,
      status: z.enum(COMMISSION_STATUSES),
      label: z.string(),
      createdAt: z.string(),
    }),
  ),
  payouts: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      grossPaise: money,
      clawbackPaise: money,
      tdsPaise: money,
      netPaise: money,
      status: z.enum(['pending', 'paid']),
      utr: z.string().nullable(),
      paidAt: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type Earnings = z.infer<typeof earningsSchema>;

export const rateCardSchema = z.object({
  planName: z.string().nullable(),
  lines: z.array(z.object({ product: z.string(), customer: z.string().nullable(), rate: z.string(), limits: z.string().nullable() })),
  notes: z.array(z.string()),
});
export type RateCard = z.infer<typeof rateCardSchema>;

/** One thing a partner can share: a link, the QR for it, and a printable poster. */
export const shareTargetSchema = z.object({
  link: z.string(),
  qrLink: z.string(),
  qrSvg: z.string(),
  posterUrl: z.string(),
  shareText: z.string(),
});
export type ShareTarget = z.infer<typeof shareTargetSchema>;

/**
 * The partner's QR codes. The top-level fields are the HO Connect referral page (/r/<code>), where the
 * customer leaves their details; `tryOn` opens the AI try-on app tagged with the partner's code (see tryon.ts).
 */
export const partnerReferralSchema = shareTargetSchema.extend({
  code: z.string(),
  benefitText: z.string().nullable(),
  tryOn: shareTargetSchema,
});
export type PartnerReferral = z.infer<typeof partnerReferralSchema>;

/** The same, for the dashboard. `active` is false while the partner is not approved: their referral page then says "not active". */
export const adminPartnerReferralSchema = partnerReferralSchema.extend({ active: z.boolean() });
export type AdminPartnerReferral = z.infer<typeof adminPartnerReferralSchema>;

export const pushTokenSchema = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, 'Not an Expo push token'),
  platform: z.enum(['ios', 'android']),
});
export const pushTokenRemoveSchema = z.object({ token: z.string().min(10).max(200) });

/** Response of the app's "Delete my account". Partners' requests wait for an admin; a login with no partner record is deleted at once. */
export const applicationDeletionSchema = z.object({ status: z.enum(['requested', 'deleted']) });
