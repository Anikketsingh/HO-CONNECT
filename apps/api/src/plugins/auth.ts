import type { AdminRole } from '@hoc/shared';
import { normalizeIndianMobile } from '@hoc/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Identity, IdentityResolver } from '../lib/identity';
import type { TokenVerifier } from '../lib/token';

export interface AuthContext {
  authUserId: string;
  /** Normalised 10-digit mobile from the token, when the user logged in by phone. */
  phone: string | null;
  email: string | null;
  identity: Identity;
}

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
  interface FastifyInstance {
    /** Any logged-in Supabase user (admin, partner, or mid-registration). */
    requireUser: Guard;
    /** Active dashboard user; optionally restricted to specific roles. */
    requireAdmin: (...roles: AdminRole[]) => Guard;
    /** Active partner user; `approved: true` also requires the partner to be approved. */
    requirePartner: (options?: { approved?: boolean }) => Guard;
  }
}

export interface AuthPluginOptions {
  verifyToken: TokenVerifier;
  resolveIdentity: IdentityResolver;
}

function deny(reply: FastifyReply, status: 401 | 403, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

export const authPlugin = fp<AuthPluginOptions>(
  async (app, { verifyToken, resolveIdentity }) => {
    async function authenticate(req: FastifyRequest): Promise<AuthContext | null> {
      if (req.auth) return req.auth;
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) return null;

      let verified;
      try {
        verified = await verifyToken(header.slice('Bearer '.length).trim());
      } catch (err) {
        req.log.debug({ err }, 'access token rejected');
        return null;
      }

      req.auth = {
        authUserId: verified.sub,
        phone: normalizeIndianMobile(verified.phone),
        email: verified.email,
        identity: await resolveIdentity(verified.sub),
      };
      return req.auth;
    }

    app.decorateRequest('auth', undefined);

    app.decorate('requireUser', async (req: FastifyRequest, reply: FastifyReply) => {
      if (!(await authenticate(req))) return deny(reply, 401, 'unauthorized', 'Log in to continue');
    });

    app.decorate(
      'requireAdmin',
      (...roles: AdminRole[]): Guard =>
        async (req, reply) => {
          const auth = await authenticate(req);
          if (!auth) return deny(reply, 401, 'unauthorized', 'Log in to continue');
          const { identity } = auth;
          if (identity.kind !== 'admin' || !identity.active) {
            return deny(reply, 403, 'forbidden', 'Dashboard access only');
          }
          if (roles.length > 0 && !roles.includes(identity.role)) {
            return deny(reply, 403, 'forbidden', 'Your role cannot do this');
          }
        },
    );

    app.decorate(
      'requirePartner',
      ({ approved = false }: { approved?: boolean } = {}): Guard =>
        async (req, reply) => {
          const auth = await authenticate(req);
          if (!auth) return deny(reply, 401, 'unauthorized', 'Log in to continue');
          const { identity } = auth;
          if (identity.kind !== 'partner' || !identity.active) {
            return deny(reply, 403, 'forbidden', 'Partner access only');
          }
          if (approved && identity.partnerStatus !== 'approved') {
            return deny(reply, 403, 'partner_not_approved', 'Your partner account is not approved yet');
          }
        },
    );
  },
  { name: 'auth' },
);

/** Narrowing helpers for handlers that ran behind the matching guard. */
export function adminOf(req: FastifyRequest) {
  const identity = req.auth?.identity;
  if (identity?.kind !== 'admin') throw new Error('adminOf() used without requireAdmin()');
  return identity;
}

export function partnerOf(req: FastifyRequest) {
  const identity = req.auth?.identity;
  if (identity?.kind !== 'partner') throw new Error('partnerOf() used without requirePartner()');
  return identity;
}
