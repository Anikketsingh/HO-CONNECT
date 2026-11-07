import { randomUUID } from 'node:crypto';
import {
  publicConfirmResponseSchema,
  publicConfirmSchema,
  publicContactSchema,
  publicLeadInputSchema,
  publicLeadResponseSchema,
  publicReferralSchema,
  resendResponseSchema,
} from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { CommissionService } from '../services/commissions';
import type { EarningsService } from '../services/earnings';
import type { LeadService } from '../services/leads';

const codeParams = z.object({ code: z.string().regex(/^[A-Za-z0-9]{4,12}$/) });
const idParams = z.object({ id: z.uuid() });

/**
 * The customer-facing QR / link page. No login, so everything is rate-limited per IP, and the
 * service adds per-phone and daily caps. Customers are asked to confirm by OTP before anything counts.
 */
export const publicRoutes: FastifyPluginAsyncZod<{ leads: LeadService; earnings: EarningsService; commissions: CommissionService }> = async (
  app,
  { leads, earnings, commissions },
) => {
  /** Support email for the public privacy and account-deletion pages. */
  app.get(
    '/public/contact',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { response: { 200: publicContactSchema } } },
    async (_req, reply) => reply.header('Cache-Control', 'public, max-age=300').send(await commissions.publicContact()),
  );

  app.get(
    '/public/referral/:code',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { params: codeParams, response: { 200: publicReferralSchema } } },
    (req) => leads.publicReferral(req.params.code),
  );

  /** QR code image for the printable poster. */
  app.get(
    '/public/referral/:code/qr.svg',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { params: codeParams } },
    async (req, reply) =>
      reply
        .header('Content-Type', 'image/svg+xml')
        .header('Cache-Control', 'public, max-age=3600')
        // Helmet's default blocks other origins from embedding images; the poster page is on another origin.
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(await earnings.publicQr(req.params.code)),
  );

  /** QR code image for the printable AI try-on poster: opens the try-on app tagged with the partner's code. */
  app.get(
    '/public/referral/:code/tryon-qr.svg',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { params: codeParams } },
    async (req, reply) =>
      reply
        .header('Content-Type', 'image/svg+xml')
        .header('Cache-Control', 'public, max-age=3600')
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(await earnings.publicTryOnQr(req.params.code)),
  );

  app.post(
    '/public/referral/:code/leads',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: { params: codeParams, body: publicLeadInputSchema, response: { 201: publicLeadResponseSchema } },
    },
    async (req, reply) => {
      reply.code(201);
      const { website, consent: _consent, ...input } = req.body;
      if (website) {
        // A bot filled in the hidden field. Look successful and do nothing.
        return { leadId: randomUUID(), expiresAt: new Date(Date.now() + 72 * 3600_000).toISOString() };
      }
      return leads.publicSubmit(req.params.code, input);
    },
  );

  app.post(
    '/public/leads/:id/confirm',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: idParams, body: publicConfirmSchema, response: { 200: publicConfirmResponseSchema } },
    },
    async (req) => {
      await leads.publicConfirm(req.params.id, req.body.code, { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null });
      return { confirmed: true as const };
    },
  );

  app.post(
    '/public/leads/:id/resend',
    { config: { rateLimit: { max: 3, timeWindow: '1 minute' } }, schema: { params: idParams, response: { 200: resendResponseSchema } } },
    (req) => leads.publicResend(req.params.id),
  );
};
