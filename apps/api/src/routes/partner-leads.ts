import {
  consentCodeSchema,
  createLeadResponseSchema,
  leadInputSchema,
  leadOptionsSchema,
  partnerLeadDetailSchema,
  partnerLeadListSchema,
  resendResponseSchema,
} from '@hoc/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { partnerOf } from '../plugins/auth';
import type { LeadService, PartnerActor } from '../services/leads';

const idParams = z.object({ id: z.uuid() });

function actor(req: FastifyRequest): PartnerActor {
  const p = partnerOf(req);
  return { partnerId: p.partnerId, partnerUserId: p.partnerUserId };
}

/** Partner app: add leads, confirm consent, follow progress. Approved partners only. */
export const partnerLeadRoutes: FastifyPluginAsyncZod<{ leads: LeadService }> = async (app, { leads }) => {
  const approved = app.requirePartner({ approved: true });

  app.get('/partner/lead-options', { preHandler: approved, schema: { response: { 200: leadOptionsSchema } } }, (req) =>
    leads.options(actor(req)),
  );

  app.get(
    '/partner/leads',
    {
      preHandler: approved,
      schema: {
        querystring: z.object({
          filter: z.enum(['all', 'waiting', 'active', 'purchased', 'closed']).default('all'),
          page: z.coerce.number().int().min(1).default(1),
        }),
        response: { 200: partnerLeadListSchema },
      },
    },
    (req) => leads.listForPartner(actor(req).partnerId, req.query.filter, req.query.page),
  );

  app.post(
    '/partner/leads',
    {
      preHandler: approved,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { body: leadInputSchema, response: { 201: createLeadResponseSchema } },
    },
    async (req, reply) => {
      reply.code(201);
      return leads.create({ ...actor(req), channel: 'assisted', publicFlow: false }, req.body);
    },
  );

  app.get(
    '/partner/leads/:id',
    { preHandler: approved, schema: { params: idParams, response: { 200: partnerLeadDetailSchema } } },
    (req) => leads.partnerDetail(actor(req).partnerId, req.params.id),
  );

  app.post(
    '/partner/leads/:id/resend',
    {
      preHandler: approved,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: idParams, response: { 200: resendResponseSchema } },
    },
    (req) => leads.resend(actor(req), req.params.id),
  );

  app.post(
    '/partner/leads/:id/nudge',
    {
      preHandler: approved,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: idParams, response: { 200: partnerLeadDetailSchema } },
    },
    (req) => leads.nudge(actor(req), req.params.id),
  );

  app.post(
    '/partner/leads/:id/confirm',
    {
      preHandler: approved,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { params: idParams, body: consentCodeSchema, response: { 200: partnerLeadDetailSchema } },
    },
    (req) =>
      leads.verifyCode(actor(req), req.params.id, req.body.code, {
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      }),
  );
};
