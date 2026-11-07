import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface VerifiedToken {
  /** Supabase Auth user id (auth.users.id). */
  sub: string;
  /** Phone as Supabase stores it (e.g. "919876543210"), if the user logged in by phone. */
  phone: string | null;
  email: string | null;
}

export type TokenVerifier = (token: string) => Promise<VerifiedToken>;

export interface SupabaseTokenVerifierOptions {
  supabaseUrl: string;
  /** Legacy HS256 shared secret. When absent, the project's JWKS endpoint is used. */
  jwtSecret?: string;
}

/**
 * Verifies Supabase Auth access tokens. The apps only use Supabase to log in;
 * every data request goes to this API with the access token as a Bearer header.
 */
export function createSupabaseTokenVerifier({ supabaseUrl, jwtSecret }: SupabaseTokenVerifierOptions): TokenVerifier {
  const issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
  const options = { issuer, audience: 'authenticated' };

  const verify: (token: string) => Promise<JWTPayload> = jwtSecret
    ? (() => {
        const secret = new TextEncoder().encode(jwtSecret);
        return async (token) => (await jwtVerify(token, secret, options)).payload;
      })()
    : (() => {
        const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
        return async (token) => (await jwtVerify(token, jwks, options)).payload;
      })();

  return async (token) => {
    const payload = await verify(token);
    if (!payload.sub) throw new Error('token has no subject');
    return {
      sub: payload.sub,
      phone: typeof payload.phone === 'string' && payload.phone ? payload.phone : null,
      email: typeof payload.email === 'string' && payload.email ? payload.email : null,
    };
  };
}
