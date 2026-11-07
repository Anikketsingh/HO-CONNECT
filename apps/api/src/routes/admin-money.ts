import {
  adjustCommissionSchema,
  approveCommissionsSchema,
  approveResultSchema,
  benefitInputSchema,
  benefitListSchema,
  benefitUpdateSchema,
  COMMISSION_VIEWS,
  commissionDetailSchema,
  commissionListSchema,
  commissionReasonSchema,
  partnerPlanSchema,
  planAssignmentSchema,
  planInputSchema,
  planListSchema,
  planUpdateSchema,
  recordSaleResultSchema,
  ruleInputSchema,
  saleInputSchema,
  salePreviewSchema,
  settingsResponseSchema,
  settingsSchema,
} from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { CommissionService } from '../services/commissions';
import { actorOf } from './admin-partners';

const idParams = z.object({ id: z.uuid() });
const created = z.object({ id: z.uuid() });

/**
 * Dashboard money: sales, commissions, commission plans, benefits and general settings.
 * Agents record sales and read everything; admins approve, adjust, reverse and change settings
 * (enforced in the service as well as here).
 */
export const adminMoneyRoutes: FastifyPluginAsyncZod<{ commissions: CommissionService }> = async (app, { commissions }) => {
  const anyAdmin = app.requireAdmin();
  const adminOnly = app.requireAdmin('admin');

  /* Sales */
  app.post(
    '/admin/leads/:id/sales/preview',
    { preHandler: anyAdmin, schema: { params: idParams, body: saleInputSchema, response: { 200: salePreviewSchema } } },
    (req) => commissions.previewSale(req.params.id, req.body),
  );
  app.post(
    '/admin/leads/:id/sales',
    { preHandler: anyAdmin, schema: { params: idParams, body: saleInputSchema, response: { 201: recordSaleResultSchema } } },
    async (req, reply) => {
      reply.code(201);
      return commissions.recordSale(actorOf(req), req.params.id, req.body);
    },
  );

  /* Commissions */
  app.get(
    '/admin/commissions',
    {
      preHandler: anyAdmin,
      schema: {
        querystring: z.object({
          view: z.enum(COMMISSION_VIEWS).default('approvable'),
          q: z.string().trim().max(100).optional(),
          partnerId: z.uuid().optional(),
          page: z.coerce.number().int().min(1).default(1),
        }),
        response: { 200: commissionListSchema },
      },
    },
    (req) => commissions.list(req.query),
  );
  app.get(
    '/admin/commissions/:id',
    { preHandler: anyAdmin, schema: { params: idParams, response: { 200: commissionDetailSchema } } },
    (req) => commissions.detail(req.params.id),
  );
  app.post(
    '/admin/commissions/approve',
    {
      preHandler: adminOnly,
      schema: { body: approveCommissionsSchema, response: { 200: approveResultSchema } },
    },
    (req) => commissions.approve(actorOf(req), req.body.ids),
  );
  app.post(
    '/admin/commissions/:id/adjust',
    { preHandler: adminOnly, schema: { params: idParams, body: adjustCommissionSchema } },
    async (req, reply) => {
      await commissions.adjust(actorOf(req), req.params.id, req.body);
      return reply.code(204).send();
    },
  );
  app.post(
    '/admin/commissions/:id/reject',
    { preHandler: adminOnly, schema: { params: idParams, body: commissionReasonSchema } },
    async (req, reply) => {
      await commissions.reject(actorOf(req), req.params.id, req.body.reason);
      return reply.code(204).send();
    },
  );
  app.post(
    '/admin/commissions/:id/reverse',
    { preHandler: adminOnly, schema: { params: idParams, body: commissionReasonSchema } },
    async (req, reply) => {
      await commissions.reverse(actorOf(req), req.params.id, req.body.reason);
      return reply.code(204).send();
    },
  );

  /* Commission plans, rules and assignments */
  app.get('/admin/commission-plans', { preHandler: anyAdmin, schema: { response: { 200: planListSchema } } }, () =>
    commissions.listPlans(),
  );
  app.post(
    '/admin/commission-plans',
    { preHandler: adminOnly, schema: { body: planInputSchema, response: { 201: created } } },
    async (req, reply) => {
      reply.code(201);
      return { id: await commissions.createPlan(actorOf(req), req.body) };
    },
  );
  app.patch(
    '/admin/commission-plans/:id',
    { preHandler: adminOnly, schema: { params: idParams, body: planUpdateSchema } },
    async (req, reply) => {
      await commissions.updatePlan(actorOf(req), req.params.id, req.body);
      return reply.code(204).send();
    },
  );
  app.post(
    '/admin/commission-plans/:id/rules',
    { preHandler: adminOnly, schema: { params: idParams, body: ruleInputSchema, response: { 201: created } } },
    async (req, reply) => {
      reply.code(201);
      return { id: await commissions.saveRule(actorOf(req), req.params.id, null, req.body) };
    },
  );
  app.put(
    '/admin/commission-plans/:id/rules/:ruleId',
    { preHandler: adminOnly, schema: { params: z.object({ id: z.uuid(), ruleId: z.uuid() }), body: ruleInputSchema } },
    async (req, reply) => {
      await commissions.saveRule(actorOf(req), req.params.id, req.params.ruleId, req.body);
      return reply.code(204).send();
    },
  );
  app.delete(
    '/admin/commission-plans/:id/rules/:ruleId',
    { preHandler: adminOnly, schema: { params: z.object({ id: z.uuid(), ruleId: z.uuid() }) } },
    async (req, reply) => {
      await commissions.deleteRule(actorOf(req), req.params.id, req.params.ruleId);
      return reply.code(204).send();
    },
  );
  app.put('/admin/plan-assignments', { preHandler: adminOnly, schema: { body: planAssignmentSchema } }, async (req, reply) => {
    await commissions.setAssignment(actorOf(req), req.body);
    return reply.code(204).send();
  });
  app.get(
    '/admin/partners/:id/plan',
    { preHandler: anyAdmin, schema: { params: idParams, response: { 200: partnerPlanSchema } } },
    (req) => commissions.partnerPlan(req.params.id),
  );

  /* Referral benefits */
  app.get('/admin/benefits', { preHandler: anyAdmin, schema: { response: { 200: benefitListSchema } } }, () =>
    commissions.listBenefits(),
  );
  app.post(
    '/admin/benefits',
    { preHandler: adminOnly, schema: { body: benefitInputSchema, response: { 201: created } } },
    async (req, reply) => {
      reply.code(201);
      return { id: await commissions.saveBenefit(actorOf(req), null, req.body) };
    },
  );
  app.patch(
    '/admin/benefits/:id',
    { preHandler: adminOnly, schema: { params: idParams, body: benefitUpdateSchema } },
    async (req, reply) => {
      await commissions.saveBenefit(actorOf(req), req.params.id, req.body);
      return reply.code(204).send();
    },
  );

  /* General settings */
  app.get('/admin/settings', { preHandler: anyAdmin, schema: { response: { 200: settingsResponseSchema } } }, () =>
    commissions.getSettings(),
  );
  app.put('/admin/settings', { preHandler: adminOnly, schema: { body: settingsSchema.partial() } }, async (req, reply) => {
    await commissions.updateSettings(actorOf(req), req.body);
    return reply.code(204).send();
  });
};
