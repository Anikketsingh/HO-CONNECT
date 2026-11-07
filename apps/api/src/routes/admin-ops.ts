import {
  auditListSchema,
  auditQuerySchema,
  closeAccountSchema,
  funnelReportSchema,
  metricsSchema,
  reportQuerySchema,
  teamCreateResponseSchema,
  teamCreateSchema,
  teamListSchema,
  teamUpdateSchema,
  withdrawConsentSchema,
} from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { PrivacyService } from '../services/privacy';
import type { ReportService } from '../services/reports';
import type { TeamService } from '../services/team';
import { actorOf } from './admin-partners';

const idParams = z.object({ id: z.uuid() });

/** Dashboard: reports, audit log, team, and the privacy actions. */
export const adminOpsRoutes: FastifyPluginAsyncZod<{ reports: ReportService; team: TeamService; privacy: PrivacyService }> = async (
  app,
  { reports, team, privacy },
) => {
  const anyAdmin = app.requireAdmin();
  const adminOnly = app.requireAdmin('admin');

  app.get('/admin/reports/funnel', { preHandler: anyAdmin, schema: { querystring: reportQuerySchema, response: { 200: funnelReportSchema } } }, (req) =>
    reports.funnel(req.query),
  );
  app.get('/admin/reports/metrics', { preHandler: anyAdmin, schema: { querystring: reportQuerySchema.omit({ by: true }), response: { 200: metricsSchema } } }, (req) =>
    reports.metrics(req.query),
  );
  app.get('/admin/audit', { preHandler: adminOnly, schema: { querystring: auditQuerySchema, response: { 200: auditListSchema } } }, (req) =>
    reports.audit(req.query),
  );

  app.get('/admin/team', { preHandler: adminOnly, schema: { response: { 200: teamListSchema } } }, async (req) => ({ items: await team.list(actorOf(req)) }));
  app.post('/admin/team', { preHandler: adminOnly, schema: { body: teamCreateSchema, response: { 201: teamCreateResponseSchema } } }, async (req, reply) => {
    reply.code(201);
    return team.create(actorOf(req), req.body);
  });
  app.patch('/admin/team/:id', { preHandler: adminOnly, schema: { params: idParams, body: teamUpdateSchema } }, async (req, reply) => {
    await team.update(actorOf(req), req.params.id, req.body);
    return reply.code(204).send();
  });

  app.post('/admin/partners/:id/close-account', { preHandler: adminOnly, schema: { params: idParams, body: closeAccountSchema } }, async (req, reply) => {
    await privacy.closeAccount(actorOf(req), req.params.id, req.body.note);
    return reply.code(204).send();
  });
  app.post('/admin/leads/:id/withdraw-consent', { preHandler: anyAdmin, schema: { params: idParams, body: withdrawConsentSchema } }, async (req, reply) => {
    await privacy.withdrawConsent(actorOf(req), req.params.id, req.body.note);
    return reply.code(204).send();
  });
};
