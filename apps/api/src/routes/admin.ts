import { adminOverviewSchema } from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { OverviewQuery } from '../lib/overview';

export const adminRoutes: FastifyPluginAsyncZod<{ getOverview: OverviewQuery }> = async (app, opts) => {
  /** Dashboard home numbers. Admins and agents. */
  app.get(
    '/admin/overview',
    { preHandler: app.requireAdmin(), schema: { response: { 200: adminOverviewSchema } } },
    () => opts.getOverview(),
  );
};
