import {
  qrCodeDetailSchema,
  qrCodeInputSchema,
  qrCodeListQuerySchema,
  qrCodeListSchema,
  qrCodePreviewSchema,
  qrCodeUpdateSchema,
} from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { QrCodeService } from '../services/qr-codes';
import { actorOf } from './admin-partners';

const idParams = z.object({ id: z.uuid() });

/** Dashboard: custom QR codes for HO stores, events and the like. Admins and agents. */
export const adminQrCodeRoutes: FastifyPluginAsyncZod<{ qrCodes: QrCodeService }> = async (app, { qrCodes }) => {
  const staff = app.requireAdmin();

  app.get('/admin/qr-codes', { preHandler: staff, schema: { querystring: qrCodeListQuerySchema, response: { 200: qrCodeListSchema } } }, async (req) => ({
    items: await qrCodes.list(req.query.archived),
  }));

  app.post('/admin/qr-codes/preview', { preHandler: staff, schema: { body: qrCodeInputSchema, response: { 200: qrCodePreviewSchema } } }, (req) =>
    qrCodes.preview(req.body),
  );

  app.post('/admin/qr-codes', { preHandler: staff, schema: { body: qrCodeInputSchema, response: { 201: qrCodeDetailSchema } } }, async (req, reply) => {
    reply.code(201);
    return qrCodes.create(actorOf(req), req.body);
  });

  app.get('/admin/qr-codes/:id', { preHandler: staff, schema: { params: idParams, response: { 200: qrCodeDetailSchema } } }, (req) => qrCodes.detail(req.params.id));

  app.patch('/admin/qr-codes/:id', { preHandler: staff, schema: { params: idParams, body: qrCodeUpdateSchema, response: { 200: qrCodeDetailSchema } } }, (req) =>
    qrCodes.update(actorOf(req), req.params.id, req.body),
  );
};
