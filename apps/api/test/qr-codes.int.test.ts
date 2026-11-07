/** Custom QR codes (HO stores, events…) in the dashboard, against a real Postgres. Skipped unless TEST_DATABASE_URL is set. */
import { auditLog, qrCodes } from '@hoc/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addAdmins, addPartner, createWorld, newToken, testDatabaseUrl, type Tokens } from './helpers';

const url = testDatabaseUrl();
const tokens: Tokens = {
  admin: newToken({ email: 'admin@ho.test' }),
  agent: newToken({ email: 'agent@ho.test' }),
  glow: newToken({ phone: '919811111111' }),
};

let w: Awaited<ReturnType<typeof createWorld>>;
const store = (o: Record<string, unknown> = {}) => ({
  name: 'Andheri store counter',
  label: 'HairOriginals Andheri',
  kind: 'store',
  destination: 'tryon',
  utmSource: 'ho_store',
  utmMedium: 'qr',
  utmCampaign: 'andheri-store',
  ...o,
});

describe.skipIf(!url)('custom QR codes (Postgres)', () => {
  beforeAll(async () => {
    w = await createWorld({ url: url!, tokens });
    await addAdmins(w.db, tokens);
    await addPartner(w.db, { token: tokens.glow, name: 'Glow Studio', phone: '9811111111', code: 'HOC00001' });
  });
  afterAll(async () => {
    await w?.close();
  });

  it('previews without saving, and checks the form', async () => {
    const p = await w.req('POST', '/admin/qr-codes/preview', 'agent', store());
    expect(p.statusCode).toBe(200);
    expect(p.json().link).toBe('https://aitryon.hairoriginals.com/?utm_source=ho_store&utm_medium=qr&utm_campaign=andheri-store');
    expect(p.json().qrSvg).toContain('<svg');
    expect(await w.db.select().from(qrCodes)).toHaveLength(0);

    const err = async (o: Record<string, unknown>) => (await w.req('POST', '/admin/qr-codes/preview', 'agent', store(o))).json().error.message;
    expect(await err({ utmSource: 'ho_connect' })).toContain('kept for partner');
    expect(await err({ utmCampaign: 'andheri store' })).toContain('no spaces');
    expect(await err({ destination: 'url' })).toContain('https://');
    expect(await err({ destination: 'url', targetUrl: 'http://hairoriginals.com' })).toContain('https://');
    expect(await err({ destination: 'url', targetUrl: 'javascript:alert(1)' })).toContain('https://');
  });

  it('saves a code with its link fixed, for staff only', async () => {
    expect((await w.req('POST', '/admin/qr-codes', 'glow', store())).statusCode).toBe(403);
    expect((await w.req('POST', '/admin/qr-codes', undefined, store())).statusCode).toBe(401);

    const res = await w.req('POST', '/admin/qr-codes', 'agent', store({ destination: 'url', targetUrl: 'https://hairoriginals.com/pages/stores?city=mumbai', utmContent: 'counter', kind: 'event' }));
    expect(res.statusCode).toBe(201);
    const qr = res.json();
    expect(qr).toMatchObject({
      name: 'Andheri store counter',
      kind: 'event',
      link: 'https://hairoriginals.com/pages/stores?city=mumbai&utm_source=ho_store&utm_medium=qr&utm_campaign=andheri-store&utm_content=counter',
      createdBy: 'Ravi Agent',
      archivedAt: null,
    });
    expect(qr.qrSvg).toContain('<svg');
    expect((await w.req('GET', `/admin/qr-codes/${qr.id}`, 'admin')).json().link).toBe(qr.link);
    const [entry] = await w.db.select().from(auditLog).where(eq(auditLog.entityId, qr.id));
    expect(entry?.action).toBe('qr_code.created');
  });

  it('lets staff rename, and only admins archive; the link never changes', async () => {
    const qr = (await w.req('POST', '/admin/qr-codes', 'admin', store())).json();
    const renamed = await w.req('PATCH', `/admin/qr-codes/${qr.id}`, 'agent', { name: 'Andheri store, front desk', label: null, utmCampaign: 'changed' });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ name: 'Andheri store, front desk', label: null, link: qr.link, utmCampaign: 'andheri-store' });

    expect((await w.req('PATCH', `/admin/qr-codes/${qr.id}`, 'agent', { archived: true })).statusCode).toBe(403);
    expect((await w.req('PATCH', `/admin/qr-codes/${qr.id}`, 'admin', { archived: true })).json().archivedAt).not.toBeNull();
    const live = (await w.req('GET', '/admin/qr-codes', 'agent')).json().items.map((i: { id: string }) => i.id);
    const archived = (await w.req('GET', '/admin/qr-codes?archived=true', 'agent')).json().items.map((i: { id: string }) => i.id);
    expect(live).not.toContain(qr.id);
    expect(archived).toEqual([qr.id]);
    expect((await w.req('PATCH', `/admin/qr-codes/${qr.id}`, 'admin', { archived: false })).json().archivedAt).toBeNull();
    const actions = (await w.db.select().from(auditLog).where(eq(auditLog.entityId, qr.id))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['qr_code.created', 'qr_code.updated', 'qr_code.archived', 'qr_code.restored']));
  });
});
