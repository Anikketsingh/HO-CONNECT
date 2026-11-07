import { z } from 'zod';
import { DOCUMENT_STATUSES, PARTNER_STATUSES, PAYOUT_METHODS, type PartnerStatus } from './enums';

/* ───────────────────────── Field formats (Indian) ───────────────────────── */

/** PAN: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F). */
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** GSTIN: state code, PAN, entity number, "Z", checksum (e.g. 07ABCDE1234F1Z5). */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** IFSC: 4 letters, a zero, 6 letters or digits (e.g. HDFC0001234). */
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** UPI id: handle@bank (e.g. priya.salon@okhdfcbank). */
export const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
export const BANK_ACCOUNT_REGEX = /^[0-9]{9,18}$/;

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

/** Upper-cases and strips spaces, for PAN / GSTIN / IFSC typed on a phone. */
const code = (regex: RegExp, message: string) =>
  z
    .string()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().regex(regex, message));

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} is too short`)
    .max(max, `${label} is too long`);

/* ───────────────────────── Partner application inputs ───────────────────────── */

/** Step 1 of registration: who and where. */
export const partnerProfileInputSchema = z.object({
  partnerTypeId: z.uuid(),
  businessName: text(2, 120, 'Business name'),
  ownerName: text(2, 80, 'Your name'),
  email: z
    .union([z.literal(''), z.email('Enter a valid email')])
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null)),
  addressLine: text(5, 200, 'Address'),
  city: text(2, 60, 'City'),
  state: z.enum(INDIAN_STATES, { error: 'Choose a state' }),
  pincode: z.string().trim().regex(PINCODE_REGEX, 'Enter a 6-digit pincode'),
  homeCentreId: z.uuid({ error: 'Choose your nearest experience centre' }),
});
export type PartnerProfileInput = z.input<typeof partnerProfileInputSchema>;

export const payoutInputSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('upi'),
    upiId: z.string().trim().regex(UPI_REGEX, 'Enter a valid UPI id, e.g. name@okhdfcbank'),
  }),
  z.object({
    method: z.literal('bank'),
    accountHolder: text(2, 100, 'Account holder name'),
    accountNumber: z
      .string()
      .transform((v) => v.replace(/\s+/g, ''))
      .pipe(z.string().regex(BANK_ACCOUNT_REGEX, 'Enter a valid account number (9–18 digits)')),
    ifsc: code(IFSC_REGEX, 'Enter a valid IFSC, e.g. HDFC0001234'),
  }),
]);
export type PayoutInput = z.input<typeof payoutInputSchema>;
export type PayoutDetails = z.output<typeof payoutInputSchema>;

/** Step 2: tax and payout. */
export const partnerPayoutStepSchema = z.object({
  pan: code(PAN_REGEX, 'Enter a valid PAN, e.g. ABCDE1234F'),
  gstin: z
    .union([z.literal(''), code(GSTIN_REGEX, 'Enter a valid GSTIN')])
    .nullish()
    .transform((v) => v || null),
  payout: payoutInputSchema,
});

/** PATCH body: any subset of the two steps. */
export const partnerApplicationUpdateSchema = partnerProfileInputSchema.partial().extend({
  pan: partnerPayoutStepSchema.shape.pan.optional(),
  gstin: partnerPayoutStepSchema.shape.gstin.optional(),
  payout: payoutInputSchema.optional(),
});
export type PartnerApplicationUpdate = z.input<typeof partnerApplicationUpdateSchema>;

export const submitApplicationSchema = z.object({
  /** The partner-terms version the partner read and accepted. */
  acceptTermsVersion: z.string().min(1),
});

/** "priya.salon@okhdfcbank" → "UPI · pri•••@okhdfcbank"; account → "Bank · HDFC · ••••4321". */
export function payoutDisplay(p: PayoutDetails): string {
  if (p.method === 'upi') {
    const [handle = '', bank = ''] = p.upiId.split('@');
    return `UPI · ${handle.slice(0, 3)}•••@${bank}`;
  }
  return `Bank · ${p.ifsc.slice(0, 4)} · ••••${p.accountNumber.slice(-4)}`;
}

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

/** Statuses in which the partner may edit their application and documents. */
export const EDITABLE_PARTNER_STATUSES = ['draft', 'changes_requested'] as const satisfies readonly PartnerStatus[];
export function canPartnerEdit(status: PartnerStatus): boolean {
  return (EDITABLE_PARTNER_STATUSES as readonly string[]).includes(status);
}

/* ───────────────────────── Responses ───────────────────────── */

export const documentTypeSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  required: z.boolean(),
  acceptedMimeTypes: z.array(z.string()),
  maxFiles: z.number().int(),
});
export type DocumentTypeInfo = z.infer<typeof documentTypeSchema>;

export const partnerTypeOptionSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  documents: z.array(documentTypeSchema),
});

export const registrationOptionsSchema = z.object({
  partnerTypes: z.array(partnerTypeOptionSchema),
  centres: z.array(z.object({ id: z.uuid(), name: z.string(), city: z.string() })),
  states: z.array(z.string()),
  terms: z.object({ version: z.string(), title: z.string(), body: z.string() }).nullable(),
});
export type RegistrationOptions = z.infer<typeof registrationOptionsSchema>;

export const partnerDocumentSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  status: z.enum(DOCUMENT_STATUSES),
  reviewerNote: z.string().nullable(),
  createdAt: z.string(),
});
export type PartnerDocumentInfo = z.infer<typeof partnerDocumentSchema>;

/** Why an application can't be submitted yet, in words the partner can act on. */
export const blockerSchema = z.object({ key: z.string(), message: z.string() });

export const partnerApplicationSchema = z.object({
  id: z.uuid(),
  status: z.enum(PARTNER_STATUSES),
  code: z.string().nullable(),
  partnerType: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }),
  businessName: z.string().nullable(),
  ownerName: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  pincode: z.string().nullable(),
  homeCentre: z.object({ id: z.uuid(), name: z.string(), city: z.string() }).nullable(),
  panLast4: z.string().nullable(),
  gstin: z.string().nullable(),
  payoutMethod: z.enum(PAYOUT_METHODS).nullable(),
  payoutDisplay: z.string().nullable(),
  agreementVersion: z.string().nullable(),
  agreementAcceptedAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
  reviewNote: z.string().nullable(),
  deletionRequestedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  checklist: z.array(z.object({ documentType: documentTypeSchema, documents: z.array(partnerDocumentSchema) })),
  blockers: z.array(blockerSchema),
  canEdit: z.boolean(),
});
export type PartnerApplication = z.infer<typeof partnerApplicationSchema>;

/* ───────────────────────── Admin ───────────────────────── */

export const adminPartnerListQuerySchema = z.object({
  status: z.enum(PARTNER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const adminPartnerListSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      code: z.string().nullable(),
      status: z.enum(PARTNER_STATUSES),
      businessName: z.string().nullable(),
      ownerName: z.string().nullable(),
      phone: z.string(),
      city: z.string().nullable(),
      partnerType: z.string(),
      submittedAt: z.string().nullable(),
      updatedAt: z.string(),
    }),
  ),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  counts: z.record(z.enum(PARTNER_STATUSES), z.number().int()),
});
export type AdminPartnerList = z.infer<typeof adminPartnerListSchema>;

export const adminPartnerDocumentSchema = partnerDocumentSchema.extend({
  /** Short-lived signed URL to view the file. */
  viewUrl: z.string().nullable(),
  reviewedAt: z.string().nullable(),
});

export const adminPartnerDetailSchema = partnerApplicationSchema.omit({ checklist: true, canEdit: true }).extend({
  checklist: z.array(z.object({ documentType: documentTypeSchema, documents: z.array(adminPartnerDocumentSchema) })),
  internalNotes: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  createdAt: z.string(),
  /** What still blocks approval (for the agent). */
  approvalBlockers: z.array(blockerSchema),
  history: z.array(
    z.object({
      action: z.string(),
      actor: z.string(),
      reason: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type AdminPartnerDetail = z.infer<typeof adminPartnerDetailSchema>;

export const PARTNER_DECISIONS = ['approve', 'request_changes', 'reject', 'suspend', 'reactivate'] as const;
export type PartnerDecision = (typeof PARTNER_DECISIONS)[number];

export const partnerDecisionSchema = z
  .object({
    action: z.enum(PARTNER_DECISIONS),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.action === 'approve' || v.action === 'reactivate' || (v.note && v.note.length >= 5), {
    message: 'Add a short note for the partner (at least 5 characters)',
    path: ['note'],
  });

export const documentReviewSchema = z
  .object({
    status: z.enum(['accepted', 'rejected']),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.status === 'accepted' || (v.note && v.note.length >= 3), {
    message: 'Tell the partner what is wrong with this document',
    path: ['note'],
  });

export const internalNotesSchema = z.object({ internalNotes: z.string().max(5000) });

export const partnerSensitiveSchema = z.object({
  pan: z.string().nullable(),
  payout: z
    .union([
      z.object({ method: z.literal('upi'), upiId: z.string() }),
      z.object({ method: z.literal('bank'), accountHolder: z.string(), accountNumber: z.string(), ifsc: z.string() }),
    ])
    .nullable(),
});
export type PartnerSensitive = z.infer<typeof partnerSensitiveSchema>;

/* ───────────────────────── Settings: partner types and checklists ───────────────────────── */

export const ACCEPTED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const partnerTypeAdminSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  partnerCount: z.number().int(),
  documents: z.array(documentTypeSchema.extend({ active: z.boolean(), sortOrder: z.number().int() })),
});
export const partnerTypeAdminListSchema = z.object({ items: z.array(partnerTypeAdminSchema) });
export type PartnerTypeAdmin = z.infer<typeof partnerTypeAdminSchema>;

export const partnerTypeInputSchema = z.object({
  name: text(2, 60, 'Name'),
  description: z.string().trim().max(300).nullish(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
export const partnerTypeUpdateSchema = partnerTypeInputSchema.partial();

const documentTypeFields = {
  name: text(2, 80, 'Name'),
  description: z.string().trim().max(300).nullable(),
  required: z.boolean(),
  acceptedMimeTypes: z.array(z.enum(ACCEPTED_UPLOAD_TYPES)).min(1, 'Allow at least one file type'),
  maxFiles: z.number().int().min(1).max(10),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
};

export const documentTypeInputSchema = z.object({
  ...documentTypeFields,
  description: documentTypeFields.description.optional(),
  required: documentTypeFields.required.default(true),
  acceptedMimeTypes: documentTypeFields.acceptedMimeTypes.default([...ACCEPTED_UPLOAD_TYPES]),
  maxFiles: documentTypeFields.maxFiles.default(1),
  active: documentTypeFields.active.optional(),
  sortOrder: documentTypeFields.sortOrder.optional(),
});

/**
 * PATCH body. Built without defaults on purpose: zod applies defaults inside .partial(),
 * which would silently reset fields the admin didn't touch.
 */
export const documentTypeUpdateSchema = z.object(documentTypeFields).partial();
