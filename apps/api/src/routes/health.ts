import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export interface HealthRoutesOptions {
  version: string;
  checkDb?: () => Promise<void>;
}

export const healthRoutes: FastifyPluginAsyncZod<HealthRoutesOptions> = async (app, { version, checkDb }) => {
  /** Liveness: the process is up. */
  app.get(
    '/health',
    { schema: { response: { 200: z.object({ status: z.literal('ok'), version: z.string() }) } } },
    async () => ({ status: 'ok' as const, version }),
  );

  /** Readiness: the database is reachable. Use this as the Railway health check. */
  app.get('/health/ready', async (req, reply) => {
    try {
      await checkDb?.();
      return { status: 'ok' };
    } catch (err) {
      req.log.error({ err }, 'readiness check failed');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
};
