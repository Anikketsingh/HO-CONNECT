import { z } from 'zod';
import { ADMIN_ROLES, PARTNER_STATUSES } from './enums';

/**
 * API contracts shared by the API (response serialisation), the dashboard and the app.
 * Responses are serialised through these schemas, so fields not listed here never leave the API.
 */

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const meResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('admin'),
    role: z.enum(ADMIN_ROLES),
    name: z.string(),
    email: z.string(),
    active: z.boolean(),
  }),
  z.object({
    kind: z.literal('partner'),
    partnerId: z.string().uuid(),
    partnerStatus: z.enum(PARTNER_STATUSES),
    active: z.boolean(),
  }),
  z.object({
    kind: z.literal('unregistered'),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
]);
export type MeResponse = z.infer<typeof meResponseSchema>;

const count = z.number().int().nonnegative();

/** Dashboard home: headline numbers. */
export const adminOverviewSchema = z.object({
  partners: z.object({ total: count, awaitingReview: count, approved: count, deletionRequests: count }),
  commissions: z.object({ toApprove: count }),
  leads: z.object({ total: count, toVerify: count, active: count, purchased: count }),
  centres: count,
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;
