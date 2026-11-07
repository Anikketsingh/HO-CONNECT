import {
  batchDetailSchema,
  batchInputSchema,
  batchListSchema,
  commissionReasonSchema,
  markFailedSchema,
  markPaidSchema,
  payoutPlanSchema,
} from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { PayoutService } from '../services/payouts';
import { actorOf } from './admin-partners';

const idParams = z.object({ id: z.uuid() });
const payoutParams = z.object({ id: z.uuid(), payoutId: z.uuid() });

/** Dashboard payouts. Admins only: this is where money leaves. */
export const adminPayoutRoutes: FastifyPluginAsyncZod<{ payouts: PayoutService }> = async (app, { payouts }) => {
  const admin = app.requireAdmin('admin');

  app.get('/admin/payouts/preview', { preHandler: admin, schema: { response: { 200: payoutPlanSchema } } }, (req) => payouts.preview(actorOf(req)));

  app.get('/admin/payout-batches', { preHandler: admin, schema: { response: { 200: batchListSchema } } }, async (req) => ({
    items: await payouts.listBatches(actorOf(req)),
  }));

  app.post(
    '/admin/payout-batches',
    { preHandler: admin, schema: { body: batchInputSchema, response: { 201: z.object({ id: z.uuid() }) } } },
    async (req, reply) => {
      reply.code(201);
      return { id: await payouts.createBatch(actorOf(req), req.body.label) };
    },
  );

  app.get('/admin/payout-batches/:id', { preHandler: admin, schema: { params: idParams, response: { 200: batchDetailSchema } } }, (req) =>
    payouts.batch(actorOf(req), req.params.id),
  );

  /** The finance file. Contains bank details and PAN, so it is never cached. */
  app.get('/admin/payout-batches/:id/csv', { preHandler: admin, schema: { params: idParams } }, async (req, reply) => {
    const { fileName, csv } = await payouts.exportCsv(actorOf(req), req.params.id);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .header('Cache-Control', 'no-store')
      .send(`﻿${csv}`); // BOM so Excel opens names in other scripts (e.g. Hindi) correctly
  });

  app.post(
    '/admin/payout-batches/:id/payouts/:payoutId/paid',
    { preHandler: admin, schema: { params: payoutParams, body: markPaidSchema } },
    async (req, reply) => {
      await payouts.markPaid(actorOf(req), req.params.id, req.params.payoutId, req.body.utr);
      return reply.code(204).send();
    },
  );
  app.post(
    '/admin/payout-batches/:id/payouts/:payoutId/failed',
    { preHandler: admin, schema: { params: payoutParams, body: markFailedSchema } },
    async (req, reply) => {
      await payouts.markFailed(actorOf(req), req.params.id, req.params.payoutId, req.body.reason);
      return reply.code(204).send();
    },
  );
  app.post(
    '/admin/payout-batches/:id/cancel',
    { preHandler: admin, schema: { params: idParams, body: commissionReasonSchema } },
    async (req, reply) => {
      await payouts.cancelBatch(actorOf(req), req.params.id, req.body.reason);
      return reply.code(204).send();
    },
  );
};
