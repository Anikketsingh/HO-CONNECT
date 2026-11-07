import { z } from 'zod';
import { slugify, TRYON_UTM_SOURCE, withUtm } from './tryon';

/*
 * Custom QR codes: for places that are not partners (HO's own stores, events, flyers…). Made in the dashboard.
 * Each one opens the AI try-on app or any https page, with UTM tags so the CRM shows where the visitor came from.
 * The finished link is saved with the code: a printed code never changes, even if settings do.
 */

export const QR_CODE_KINDS = ['store', 'event', 'other'] as const;
export type QrCodeKind = (typeof QR_CODE_KINDS)[number];
export const QR_KIND_LABELS: Record<QrCodeKind, string> = { store: 'HO store', event: 'Event', other: 'Other' };

export const QR_DESTINATIONS = ['tryon', 'url'] as const;
export type QrDestination = (typeof QR_DESTINATIONS)[number];
export const QR_DESTINATION_LABELS: Record<QrDestination, string> = { tryon: 'AI try-on app', url: 'Another web page' };

/** Suggested utm_source per kind. Never "ho_connect": that one means "a partner salon" (see tryon.ts). */
export const DEFAULT_QR_UTM_SOURCE: Record<QrCodeKind, string> = { store: 'ho_store', event: 'ho_event', other: 'ho_offline' };

/** What the form starts with for a name and kind; staff can change any of it. */
export function suggestQrUtm(kind: QrCodeKind, name: string) {
  return { utmSource: DEFAULT_QR_UTM_SOURCE[kind], utmMedium: 'qr', utmCampaign: slugify(name, 60) };
}

const utmValue = z
  .string()
  .trim()
  .max(100, 'Keep UTM values under 100 characters')
  .regex(/^[A-Za-z0-9._~-]*$/, 'UTM values can use letters, numbers and - _ . ~ (no spaces)');
const optional = (s: z.ZodString) => s.optional().transform((v) => v || null);

export const qrCodeInputSchema = z
  .object({
    /** For staff, e.g. "Andheri store counter" or "Bridal expo Dec 2026, stall 4". */
    name: z.string().trim().min(2, 'Give it a name').max(80, 'Name is too long'),
    /** Printed at the top of the poster, e.g. "HairOriginals Andheri". */
    label: optional(z.string().trim().max(60, 'Poster label is too long')),
    kind: z.enum(QR_CODE_KINDS),
    destination: z.enum(QR_DESTINATIONS),
    /** Only for destination "url". */
    targetUrl: optional(z.string().trim().max(500, 'The address is too long')),
    utmSource: utmValue.min(1, 'utm_source is required'),
    utmMedium: utmValue.min(1, 'utm_medium is required'),
    utmCampaign: utmValue.min(1, 'utm_campaign is required'),
    utmContent: optional(utmValue),
    notes: optional(z.string().trim().max(500, 'Notes are too long')),
  })
  .superRefine((v, ctx) => {
    if (v.utmSource.toLowerCase() === TRYON_UTM_SOURCE) {
      ctx.addIssue({ code: 'custom', path: ['utmSource'], message: `utm_source "${TRYON_UTM_SOURCE}" is kept for partner salons' codes` });
    }
    if (v.destination === 'url' && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]\S*)?$/i.test(v.targetUrl ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['targetUrl'], message: 'Enter a full web address starting with https://' });
    }
  });
export type QrCodeInput = z.input<typeof qrCodeInputSchema>;
export type QrCodeValues = z.output<typeof qrCodeInputSchema>;

/** Names, poster label and notes can change; the link can't (it may already be printed). Archive hides it from the list. */
export const qrCodeUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Give it a name').max(80, 'Name is too long').optional(),
  label: z.string().trim().max(60, 'Poster label is too long').nullable().optional(),
  notes: z.string().trim().max(500, 'Notes are too long').nullable().optional(),
  archived: z.boolean().optional(),
});

/** The link a custom QR code opens. */
export function customQrLink(v: Pick<QrCodeValues, 'destination' | 'targetUrl' | 'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmContent'>, tryOnUrl: string): string {
  return withUtm(v.destination === 'tryon' ? tryOnUrl : v.targetUrl!, [
    ['utm_source', v.utmSource],
    ['utm_medium', v.utmMedium],
    ['utm_campaign', v.utmCampaign],
    ['utm_content', v.utmContent],
  ]);
}

export const qrCodeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  label: z.string().nullable(),
  kind: z.enum(QR_CODE_KINDS),
  destination: z.enum(QR_DESTINATIONS),
  targetUrl: z.string().nullable(),
  utmSource: z.string(),
  utmMedium: z.string(),
  utmCampaign: z.string(),
  utmContent: z.string().nullable(),
  link: z.string(),
  notes: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type QrCode = z.infer<typeof qrCodeSchema>;

export const qrCodeDetailSchema = qrCodeSchema.extend({ qrSvg: z.string() });
export type QrCodeDetail = z.infer<typeof qrCodeDetailSchema>;

export const qrCodeListQuerySchema = z.object({ archived: z.enum(['true', 'false']).default('false').transform((v) => v === 'true') });
export const qrCodeListSchema = z.object({ items: z.array(qrCodeSchema) });

export const qrCodePreviewSchema = z.object({ link: z.string(), qrSvg: z.string() });
