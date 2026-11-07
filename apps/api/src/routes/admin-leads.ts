import {
  adminLeadDetailSchema,
  adminLeadListQuerySchema,
  adminLeadListSchema,
  bulkJobSchema,
  bulkStageSchema,
  csvPreviewSchema,
  leadNoteSchema,
  stageChangeResultSchema,
  stageChangeSchema,
  verifyLeadSchema,
} from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { LeadService } from '../services/leads';
import { actorOf } from './admin-partners';

const idParams = z.object({ id: z.uuid() });

/** Dashboard: verification queue, leads, stage updates (single and bulk). Admins and agents. */
export const adminLeadRoutes: FastifyPluginAsyncZod<{ leads: LeadService }> = async (app, { leads }) => {
  const admin = app.requireAdmin();

  app.get(
    '/admin/leads',
    { preHandler: admin, schema: { querystring: adminLeadListQuerySchema, response: { 200: adminLeadListSchema } } },
    (req) => leads.listForAdmin(req.query),
  );

  app.get(
    '/admin/leads/:id',
    { preHandler: admin, schema: { params: idParams, response: { 200: adminLeadDetailSchema } } },
    (req) => leads.adminDetail(req.params.id),
  );

  app.post(
    '/admin/leads/:id/verify',
    { preHandler: admin, schema: { params: idParams, body: verifyLeadSchema } },
    async (req, reply) => {
      await leads.verify(actorOf(req), req.params.id, req.body);
      return reply.code(204).send();
    },
  );

  app.post(
    '/admin/leads/:id/stage',
    {
      preHandler: admin,
      schema: { params: idParams, body: stageChangeSchema, response: { 200: stageChangeResultSchema } },
    },
    (req) => leads.changeStage(actorOf(req), req.params.id, req.body),
  );

  app.post(
    '/admin/leads/:id/notes',
    { preHandler: admin, schema: { params: idParams, body: leadNoteSchema } },
    async (req, reply) => {
      await leads.addNote(actorOf(req), req.params.id, req.body.note);
      return reply.code(204).send();
    },
  );

  app.post(
    '/admin/leads/bulk-stage',
    { preHandler: admin, schema: { body: bulkStageSchema, response: { 200: bulkJobSchema } } },
    (req) => leads.bulkSelection(actorOf(req), req.body),
  );

  app.post(
    '/admin/leads/bulk-csv/preview',
    { preHandler: admin, bodyLimit: 2 * 1024 * 1024, schema: { body: csvPreviewSchema, response: { 200: bulkJobSchema } } },
    (req) => leads.csvPreview(actorOf(req), req.body),
  );

  app.get(
    '/admin/bulk-jobs/:id',
    { preHandler: admin, schema: { params: idParams, response: { 200: bulkJobSchema } } },
    (req) => leads.jobView(req.params.id),
  );

  app.post(
    '/admin/bulk-jobs/:id/apply',
    { preHandler: admin, schema: { params: idParams, response: { 200: bulkJobSchema } } },
    (req) => leads.applyJob(actorOf(req), req.params.id),
  );
};
