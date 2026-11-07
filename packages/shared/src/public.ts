import { z } from 'zod';
import { consentCodeSchema } from './leads';
import { normalizeIndianMobile } from './phone';

/* Public QR / link landing page. No login: everything here is rate-limited and untrusted. */

export const PUBLIC_CHANNELS = ['qr', 'link'] as const;

export const publicReferralSchema = z.object({
  partnerName: z.string(),
  benefitText: z.string().nullable(),
  categories: z.array(z.object({ id: z.uuid(), name: z.string() })),
  consent: z.object({ version: z.string(), text: z.string() }),
});
export type PublicReferral = z.infer<typeof publicReferralSchema>;

export const publicLeadInputSchema = z.object({
  customerName: z.string().trim().min(2, 'Enter your name').max(80, 'Name is too long'),
  customerPhone: z.string().transform((v, ctx) => {
    const n = normalizeIndianMobile(v);
    if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number' });
    return n ?? '';
  }),
  categoryIds: z.array(z.uuid()).min(1, 'Choose what you are interested in').max(8),
  city: z.string().trim().max(60).optional().transform((v) => v || null),
  channel: z.enum(PUBLIC_CHANNELS).default('link'),
  consent: z.literal(true, { error: 'Please tick the box to agree' }),
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(200).optional(),
});
export type PublicLeadInput = z.input<typeof publicLeadInputSchema>;

export const publicLeadResponseSchema = z.object({
  leadId: z.uuid(),
  expiresAt: z.string(),
  devCode: z.string().optional(),
});
/** Contact details for the public privacy and account-deletion pages (Settings → General → Support email). */
export const publicContactSchema = z.object({ supportEmail: z.string() });
export type PublicContact = z.infer<typeof publicContactSchema>;

export const publicConfirmSchema = consentCodeSchema;
export const publicConfirmResponseSchema = z.object({ confirmed: z.literal(true) });
