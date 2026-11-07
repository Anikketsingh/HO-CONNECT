import {
  documentTypeInputSchema,
  documentTypeUpdateSchema,
  partnerTypeAdminListSchema,
  partnerTypeInputSchema,
  partnerTypeUpdateSchema,
} from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { PartnerService } from '../services/partners';
import { actorOf } from './admin-partners';

const idParams = z.object({ id: z.uuid() });
const created = z.object({ id: z.uuid() });

/** Dashboard settings: partner types and their document checklists. Agents can read; only admins can change. */
export const adminSettingsRoutes: FastifyPluginAsyncZod<{ partners: PartnerService }> = async (app, { partners }) => {
  app.get(
    '/admin/partner-types',
    { preHandler: app.requireAdmin(), schema: { response: { 200: partnerTypeAdminListSchema } } },
    async () => ({ items: await partners.listTypes() }),
  );

  app.post(
    '/admin/partner-types',
    { preHandler: app.requireAdmin('admin'), schema: { body: partnerTypeInputSchema, response: { 201: created } } },
    async (req, reply) => {
      reply.code(201);
      return { id: await partners.createType(actorOf(req), req.body) };
    },
  );

  app.patch(
    '/admin/partner-types/:id',
    { preHandler: app.requireAdmin('admin'), schema: { params: idParams, body: partnerTypeUpdateSchema } },
    async (req, reply) => {
      await partners.updateType(actorOf(req), req.params.id, req.body);
      return reply.code(204).send();
    },
  );

  app.post(
    '/admin/partner-types/:id/document-types',
    {
      preHandler: app.requireAdmin('admin'),
      schema: { params: idParams, body: documentTypeInputSchema, response: { 201: created } },
    },
    async (req, reply) => {
      reply.code(201);
      return { id: await partners.createDocumentType(actorOf(req), req.params.id, req.body) };
    },
  );

  app.patch(
    '/admin/document-types/:id',
    { preHandler: app.requireAdmin('admin'), schema: { params: idParams, body: documentTypeUpdateSchema } },
    async (req, reply) => {
      await partners.updateDocumentType(actorOf(req), req.params.id, req.body);
      return reply.code(204).send();
    },
  );
};
