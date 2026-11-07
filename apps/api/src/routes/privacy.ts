import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { forbidden } from '../lib/errors';
import type { PrivacyService } from '../services/privacy';

/** The app's "Delete my account" (Google Play requires an in-app way to ask). */
export const privacyRoutes: FastifyPluginAsyncZod<{ privacy: PrivacyService }> = async (app, { privacy }) => {
  app.post('/me/delete-account', { preHandler: app.requireUser, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const auth = req.auth!;
    const id = auth.identity;
    if (id.kind === 'admin') throw forbidden('forbidden', 'Dashboard accounts are managed by an admin.');
    if (id.kind === 'partner') {
      await privacy.requestDeletion(id.partnerId, id.partnerUserId);
      return reply.code(202).send({ status: 'requested' });
    }
    await privacy.deleteUnregistered(auth.authUserId); // nothing to keep: the login is deleted now
    return reply.code(202).send({ status: 'deleted' });
  });
};
