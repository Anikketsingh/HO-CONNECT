import { meResponseSchema, type MeResponse } from '@hoc/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { adminOf } from '../plugins/auth';

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  /**
   * Who am I? Called by both apps right after login.
   * The partner app uses `unregistered` / `partnerStatus` to decide which screen to show.
   */
  app.get(
    '/me',
    { preHandler: app.requireUser, schema: { response: { 200: meResponseSchema } } },
    async (req): Promise<MeResponse> => {
      const auth = req.auth!;
      const { identity } = auth;
      switch (identity.kind) {
        case 'admin':
          return {
            kind: 'admin',
            role: identity.role,
            name: identity.name,
            email: identity.email,
            active: identity.active,
          };
        case 'partner':
          return {
            kind: 'partner',
            partnerId: identity.partnerId,
            partnerStatus: identity.partnerStatus,
            active: identity.active,
          };
        case 'unregistered':
          return { kind: 'unregistered', phone: auth.phone, email: auth.email };
      }
    },
  );

  /** Dashboard gate: 200 only for active admins and agents. */
  app.get(
    '/admin/me',
    { preHandler: app.requireAdmin(), schema: { response: { 200: meResponseSchema } } },
    async (req): Promise<MeResponse> => {
      const admin = adminOf(req);
      return { kind: 'admin', role: admin.role, name: admin.name, email: admin.email, active: admin.active };
    },
  );
};
