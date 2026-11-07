import { earningsSchema, partnerReferralSchema, pushTokenRemoveSchema, pushTokenSchema, rateCardSchema } from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { partnerOf } from '../plugins/auth';
import type { CommissionService } from '../services/commissions';
import type { EarningsService } from '../services/earnings';

/** Partner app: earnings, rate card, share link / QR, and push token. */
export const partnerMoneyRoutes: FastifyPluginAsyncZod<{ earnings: EarningsService; commissions: CommissionService }> = async (
  app,
  { earnings, commissions },
) => {
  const approved = app.requirePartner({ approved: true });

  app.get('/partner/earnings', { preHandler: approved, schema: { response: { 200: earningsSchema } } }, (req) =>
    earnings.earnings(partnerOf(req).partnerId),
  );

  app.get('/partner/rate-card', { preHandler: approved, schema: { response: { 200: rateCardSchema } } }, (req) =>
    commissions.partnerRateCard(partnerOf(req).partnerId),
  );

  app.get('/partner/referral', { preHandler: approved, schema: { response: { 200: partnerReferralSchema } } }, (req) =>
    earnings.referral(partnerOf(req).partnerId),
  );

  // Any partner (not only approved ones): applicants are told when a decision is made.
  app.post('/partner/push-token', { preHandler: app.requirePartner(), schema: { body: pushTokenSchema } }, async (req, reply) => {
    await earnings.registerPushToken(partnerOf(req).partnerUserId, req.body.token, req.body.platform);
    return reply.code(204).send();
  });
  app.post('/partner/push-token/remove', { preHandler: app.requirePartner(), schema: { body: pushTokenRemoveSchema } }, async (req, reply) => {
    await earnings.removePushToken(partnerOf(req).partnerUserId, req.body.token);
    return reply.code(204).send();
  });
};
