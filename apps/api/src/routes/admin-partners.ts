import {
  adminPartnerDetailSchema,
  adminPartnerReferralSchema,
  adminPartnerListQuerySchema,
  adminPartnerListSchema,
  documentReviewSchema,
  internalNotesSchema,
  PARTNER_STATUSES,
  partnerDecisionSchema,
  partnerSensitiveSchema,
} from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { adminOf } from '../plugins/auth';
import type { EarningsService } from '../services/earnings';
import type { AdminActor, PartnerService } from '../services/partners';

const idParams = z.object({ id: z.uuid() });

export function actorOf(req: Parameters<typeof adminOf>[0]): AdminActor {
  const admin = adminOf(req);
  return { adminUserId: admin.adminUserId, role: admin.role };
}

/** Dashboard: the partner approval queue. Admins and agents. */
export const adminPartnerRoutes: FastifyPluginAsyncZod<{ partners: PartnerService; earnings: EarningsService }> = async (app, { partners, earnings }) => {
  app.get(
    '/admin/partners',
    {
      preHandler: app.requireAdmin(),
      schema: { querystring: adminPartnerListQuerySchema, response: { 200: adminPartnerListSchema } },
    },
    (req) => partners.list(req.query),
  );

  app.get(
    '/admin/partners/:id',
    { preHandler: app.requireAdmin(), schema: { params: idParams, response: { 200: adminPartnerDetailSchema } } },
    (req) => partners.detail(req.params.id),
  );

  /** The partner's QR codes (HO Connect referral page and AI try-on), so staff can print them for the partner. */
  app.get(
    '/admin/partners/:id/referral',
    { preHandler: app.requireAdmin(), schema: { params: idParams, response: { 200: adminPartnerReferralSchema } } },
    (req) => earnings.adminReferral(req.params.id),
  );

  app.post(
    '/admin/partners/:id/decision',
    {
      preHandler: app.requireAdmin(),
      schema: {
        params: idParams,
        body: partnerDecisionSchema,
        response: { 200: z.object({ status: z.enum(PARTNER_STATUSES), code: z.string().nullable() }) },
      },
    },
    (req) => partners.decide(actorOf(req), req.params.id, req.body),
  );

  app.patch(
    '/admin/partners/:id/documents/:documentId',
    {
      preHandler: app.requireAdmin(),
      schema: { params: z.object({ id: z.uuid(), documentId: z.uuid() }), body: documentReviewSchema },
    },
    async (req, reply) => {
      await partners.reviewDocument(actorOf(req), req.params.id, req.params.documentId, req.body);
      return reply.code(204).send();
    },
  );

  /** Full PAN and payout details. Audited; never cached. */
  app.get(
    '/admin/partners/:id/sensitive',
    { preHandler: app.requireAdmin(), schema: { params: idParams, response: { 200: partnerSensitiveSchema } } },
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      return partners.revealSensitive(actorOf(req), req.params.id);
    },
  );

  app.put(
    '/admin/partners/:id/notes',
    { preHandler: app.requireAdmin(), schema: { params: idParams, body: internalNotesSchema } },
    async (req, reply) => {
      await partners.updateInternalNotes(actorOf(req), req.params.id, req.body.internalNotes);
      return reply.code(204).send();
    },
  );
};
