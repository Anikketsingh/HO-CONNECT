import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app';
import type { Identity } from '../src/lib/identity';
import { createSupabaseTokenVerifier, type TokenVerifier } from '../src/lib/token';
import type { CommissionService } from '../src/services/commissions';
import type { EarningsService } from '../src/services/earnings';
import type { LeadService } from '../src/services/leads';
import type { PayoutService } from '../src/services/payouts';
import type { PrivacyService } from '../src/services/privacy';
import type { QrCodeService } from '../src/services/qr-codes';
import type { ReportService } from '../src/services/reports';
import type { TeamService } from '../src/services/team';
import type { PartnerService } from '../src/services/partners';

const users: Record<string, { identity: Identity; phone?: string; email?: string }> = {
  'tok-admin': {
    identity: { kind: 'admin', adminUserId: 'a1', role: 'admin', name: 'Asha', email: 'asha@ho.test', active: true },
    email: 'asha@ho.test',
  },
  'tok-agent': {
    identity: { kind: 'admin', adminUserId: 'a2', role: 'agent', name: 'Ravi', email: 'ravi@ho.test', active: true },
  },
  'tok-inactive-admin': {
    identity: { kind: 'admin', adminUserId: 'a3', role: 'admin', name: 'Old', email: 'old@ho.test', active: false },
  },
  'tok-partner': {
    identity: {
      kind: 'partner',
      partnerUserId: 'pu1',
      partnerId: '7d1f0e4e-3a59-4c0e-9a8a-1c2b3d4e5f60',
      partnerStatus: 'submitted',
      active: true,
    },
    phone: '919876543210',
  },
  'tok-new': { identity: { kind: 'unregistered' }, phone: '919812345678' },
};

const fakeVerify: TokenVerifier = async (token) => {
  const user = users[token];
  if (!user) throw new Error('bad token');
  return { sub: `sub-${token}`, phone: user.phone ?? null, email: user.email ?? null };
};

let app: App;

beforeAll(async () => {
  app = await buildApp({
    corsOrigins: ['http://localhost:3000'],
    verifyToken: fakeVerify,
    resolveIdentity: async (sub) => users[sub.replace(/^sub-/, '')]!.identity,
    partners: {} as PartnerService, // partner routes are covered by test/partners.int.test.ts
    leads: {} as LeadService, // lead routes are covered by test/leads.int.test.ts
    commissions: {} as CommissionService, // covered by test/commissions.int.test.ts
    payouts: {} as PayoutService, // covered by test/payouts.int.test.ts
    earnings: {} as EarningsService, // covered by test/referral.int.test.ts
    reports: {} as ReportService, // covered by test/ops.int.test.ts
    team: {} as TeamService,
    privacy: {} as PrivacyService,
    qrCodes: {} as QrCodeService, // covered by test/referral.int.test.ts
    getOverview: async () => ({
      partners: { total: 3, awaitingReview: 1, approved: 2, deletionRequests: 0 },
      commissions: { toApprove: 4 },
      leads: { total: 10, toVerify: 3, active: 6, purchased: 2 },
      centres: 16,
    }),
    checkDb: async () => {},
    version: 'test',
  });
});

afterAll(async () => {
  await app.close();
});

const get = (url: string, token?: string) =>
  app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('health', () => {
  it('reports liveness and readiness', async () => {
    expect((await get('/health')).json()).toEqual({ status: 'ok', version: 'test' });
    expect((await get('/health/ready')).statusCode).toBe(200);
  });
});

describe('GET /v1/me', () => {
  it('rejects missing and invalid tokens', async () => {
    expect((await get('/v1/me')).statusCode).toBe(401);
    const res = await get('/v1/me', 'not-a-real-token');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'unauthorized', message: 'Log in to continue' } });
  });

  it('identifies an admin without leaking internal ids', async () => {
    const res = await get('/v1/me', 'tok-admin');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ kind: 'admin', role: 'admin', name: 'Asha', email: 'asha@ho.test', active: true });
  });

  it('identifies a partner', async () => {
    const body = (await get('/v1/me', 'tok-partner')).json();
    expect(body).toMatchObject({ kind: 'partner', partnerStatus: 'submitted', active: true });
    expect(body).not.toHaveProperty('partnerUserId');
  });

  it('returns the normalised phone for a user who has not registered yet', async () => {
    expect((await get('/v1/me', 'tok-new')).json()).toEqual({
      kind: 'unregistered',
      phone: '9812345678',
      email: null,
    });
  });
});

describe('GET /v1/admin/me (role guard)', () => {
  it('allows admins and agents', async () => {
    expect((await get('/v1/admin/me', 'tok-admin')).statusCode).toBe(200);
    expect((await get('/v1/admin/me', 'tok-agent')).json()).toMatchObject({ role: 'agent' });
  });

  it('blocks partners, unregistered users and deactivated admins', async () => {
    expect((await get('/v1/admin/me', 'tok-partner')).statusCode).toBe(403);
    expect((await get('/v1/admin/me', 'tok-new')).statusCode).toBe(403);
    expect((await get('/v1/admin/me', 'tok-inactive-admin')).statusCode).toBe(403);
    expect((await get('/v1/admin/me')).statusCode).toBe(401);
  });
});

describe('GET /v1/admin/overview', () => {
  it('returns the headline numbers to admins and agents only', async () => {
    const res = await get('/v1/admin/overview', 'tok-agent');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      partners: { total: 3, awaitingReview: 1, approved: 2, deletionRequests: 0 },
      commissions: { toApprove: 4 },
      leads: { total: 10, toVerify: 3, active: 6, purchased: 2 },
      centres: 16,
    });
    expect((await get('/v1/admin/overview', 'tok-partner')).statusCode).toBe(403);
    expect((await get('/v1/admin/overview')).statusCode).toBe(401);
  });
});

describe('CORS (browser preflight from the dashboard)', () => {
  const preflight = (method: string, origin = 'http://localhost:3000') =>
    app.inject({
      method: 'OPTIONS',
      url: '/v1/admin/partners/7d1f0e4e-3a59-4c0e-9a8a-1c2b3d4e5f60/documents/7d1f0e4e-3a59-4c0e-9a8a-1c2b3d4e5f61',
      headers: { origin, 'access-control-request-method': method, 'access-control-request-headers': 'authorization,content-type' },
    });

  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])('lets the dashboard send %s', async (method) => {
    const res = await preflight(method);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-methods']).toContain(method);
  });

  it('does not allow other websites', async () => {
    expect((await preflight('PATCH', 'https://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('createSupabaseTokenVerifier (HS256 mode)', () => {
  const supabaseUrl = 'https://example.supabase.co';
  const secret = 'test-secret-that-is-long-enough-for-hs256';
  const verify = createSupabaseTokenVerifier({ supabaseUrl, jwtSecret: secret });

  const sign = (claims: Record<string, unknown>, opts: { issuer?: string; audience?: string; key?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('11111111-2222-3333-4444-555555555555')
      .setIssuer(opts.issuer ?? `${supabaseUrl}/auth/v1`)
      .setAudience(opts.audience ?? 'authenticated')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(opts.key ?? secret));

  it('accepts a valid Supabase token', async () => {
    const result = await verify(await sign({ phone: '919876543210', email: '' }));
    expect(result).toEqual({ sub: '11111111-2222-3333-4444-555555555555', phone: '919876543210', email: null });
  });

  it('rejects wrong issuer, audience or signature', async () => {
    await expect(verify(await sign({}, { issuer: 'https://evil.example/auth/v1' }))).rejects.toThrow();
    await expect(verify(await sign({}, { audience: 'anon' }))).rejects.toThrow();
    await expect(verify(await sign({}, { key: 'some-other-secret-value-xxxxxxxxxx' }))).rejects.toThrow();
  });
});
