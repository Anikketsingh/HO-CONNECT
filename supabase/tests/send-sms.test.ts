/**
 * Tests for the send-sms auth hook, run under Node (vitest).
 *
 * Requests are signed the way Supabase Auth signs them (Standard Webhooks), and
 * the phone is sent as bare digits ("919876543210"), which is what Supabase
 * really sends. The AI try-on project once shipped a hook whose tests only used
 * "+91…" and broke in production.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createSendSmsHandler, parseHookPhone } from '../functions/send-sms/handler.ts';

const KEY = randomBytes(32);
const SECRET = `v1,whsec_${KEY.toString('base64')}`;
const NOW = 1_800_000_000;
const TEMPLATE = 'Your HairOriginals-AiTryOn verification code is {otp}. Do not share it with anyone.';

const ENV: Record<string, string> = {
  SEND_SMS_HOOK_SECRET: SECRET,
  NIMBUS_USER_ID: 'hoc-user',
  NIMBUS_PASSWORD: 'p@ss word&=x',
  NIMBUS_SENDER_ID: 'HAIROG',
  NIMBUS_ENTITY_ID: '1701165425595415105',
  NIMBUS_TEMPLATE_ID: '1707178394111991016',
  NIMBUS_OTP_TEMPLATE: TEMPLATE,
};

function sign(body: string, id: string, ts: string, key: Buffer = KEY) {
  return createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
}

function hookRequest(
  payload: unknown,
  opts: { key?: Buffer; timestamp?: number; signatureHeader?: string; body?: string; method?: string } = {},
) {
  const body = JSON.stringify(payload);
  const id = 'msg_2abc';
  const ts = String(opts.timestamp ?? NOW);
  return new Request('https://ref.supabase.co/functions/v1/send-sms', {
    method: opts.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': ts,
      'webhook-signature': opts.signatureHeader ?? `v1,${sign(body, id, ts, opts.key)}`,
    },
    body: opts.method === 'GET' ? undefined : (opts.body ?? body),
  });
}

const otpPayload = (phone: string, otp = '482913') => ({ user: { phone }, sms: { otp } });

function setup(env: Record<string, string | undefined> = ENV, respond: () => Promise<Response> = async () => Response.json({ Status: 'OK' })) {
  const fetch = vi.fn<typeof globalThis.fetch>(respond);
  const handler = createSendSmsHandler({ env: (name) => env[name], fetch, now: () => NOW });
  return { handler, fetch };
}

let errorLog: MockInstance<typeof console.error>;
let infoLog: MockInstance<typeof console.log>;
beforeEach(() => {
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  infoLog = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const allLogs = () => [...errorLog.mock.calls, ...infoLog.mock.calls].flat().join('\n');

describe('send-sms hook: delivery', () => {
  it('sends the exact DLT text to Nimbus for the bare-digit phone Supabase sends', async () => {
    const { handler, fetch } = setup();
    const res = await handler(hookRequest(otpPayload('919876543210')));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(fetch).toHaveBeenCalledTimes(1);

    const raw = String(fetch.mock.calls[0]![0]);
    const url = new URL(raw);
    expect(`${url.origin}${url.pathname}`).toBe('https://nimbusit.biz/api/SmsApi/SendSingleApi');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      UserID: 'hoc-user',
      Password: 'p@ss word&=x',
      SenderID: 'HAIROG',
      Phno: '9876543210',
      Msg: 'Your HairOriginals-AiTryOn verification code is 482913. Do not share it with anyone.',
      EntityID: '1701165425595415105',
      TemplateID: '1707178394111991016',
    });
    // Spaces must go as %20, never "+", or the carrier rejects the template match.
    expect(raw).toContain('Msg=Your%20HairOriginals-AiTryOn%20verification%20code%20is%20482913.');
    expect(raw).not.toContain('Your+');
  });

  it('also accepts the +91 form', async () => {
    const { handler, fetch } = setup();
    expect((await handler(hookRequest(otpPayload('+919876543210')))).status).toBe(200);
    expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get('Phno')).toBe('9876543210');
  });

  it('never logs the OTP, the full number or the Nimbus password', async () => {
    const { handler } = setup(ENV, async () => {
      throw new TypeError(
        'error sending request for url (https://nimbusit.biz/api/SmsApi/SendSingleApi?UserID=hoc-user&Password=p%40ss%20word%26%3Dx&Msg=482913)',
      );
    });
    await handler(hookRequest(otpPayload('919876543210')));
    const logs = allLogs();
    expect(logs).toContain('******3210');
    expect(logs).not.toContain('482913');
    expect(logs).not.toContain('9876543210');
    expect(logs).not.toContain('p%40ss');
    expect(logs).not.toContain('hoc-user');
  });
});

describe('send-sms hook: signature', () => {
  it('rejects other methods', async () => {
    const { handler, fetch } = setup();
    expect((await handler(hookRequest({}, { method: 'GET' }))).status).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['a different secret', { key: randomBytes(32) }],
    ['a stale timestamp', { timestamp: NOW - 6 * 60 }],
    ['a future timestamp', { timestamp: NOW + 6 * 60 }],
    ['a tampered body', { body: JSON.stringify(otpPayload('919999999999')) }],
    ['no signature', { signatureHeader: '' }],
    ['garbage signature', { signatureHeader: 'v1,!!!not-base64!!!' }],
    ['the wrong scheme', { signatureHeader: 'v2,abc' }],
  ])('rejects %s', async (_label, opts) => {
    const { handler, fetch } = setup();
    const res = await handler(hookRequest(otpPayload('919876543210'), opts));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts when any one of several signatures is valid (secret rotation)', async () => {
    const payload = otpPayload('919876543210');
    const body = JSON.stringify(payload);
    const good = sign(body, 'msg_2abc', String(NOW));
    const { handler } = setup();
    const res = await handler(
      hookRequest(payload, { signatureHeader: `v1,${sign(body, 'msg_2abc', String(NOW), randomBytes(32))} v1,${good}` }),
    );
    expect(res.status).toBe(200);
  });
});

describe('send-sms hook: refusals before any SMS is paid for', () => {
  it.each([
    ['a US number', '14155552671', 403],
    ['a UK number', '447400123456', 403],
    ['an Indian number starting with 5', '915876543210', 400],
    ['a short Indian number', '91987654321', 400],
    ['an empty phone', '', 400],
  ])('refuses %s', async (_label, phone, status) => {
    const { handler, fetch } = setup();
    const res = await handler(hookRequest(otpPayload(phone)));
    expect(res.status).toBe(status);
    expect((await res.json()).error.http_code).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a payload without an OTP', async () => {
    const { handler, fetch } = setup();
    expect((await handler(hookRequest({ user: { phone: '919876543210' }, sms: {} }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('send-sms hook: configuration and provider errors', () => {
  it('fails closed when the hook secret is missing', async () => {
    const { handler, fetch } = setup({ ...ENV, SEND_SMS_HOOK_SECRET: undefined });
    expect((await handler(hookRequest(otpPayload('919876543210')))).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed and names the missing Nimbus secret', async () => {
    const { handler, fetch } = setup({ ...ENV, NIMBUS_TEMPLATE_ID: '' });
    expect((await handler(hookRequest(otpPayload('919876543210')))).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
    expect(allLogs()).toContain('NIMBUS_TEMPLATE_ID');
  });

  it('refuses a template without {otp}', async () => {
    const { handler, fetch } = setup({ ...ENV, NIMBUS_OTP_TEMPLATE: 'Your code is ready.' });
    expect((await handler(hookRequest(otpPayload('919876543210')))).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 502 with http_code when Nimbus says no', async () => {
    const { handler } = setup(ENV, async () =>
      Response.json({ Status: 'ERROR', Response: { Message: 'TEMPLATE_ERROR' } }),
    );
    const res = await handler(hookRequest(otpPayload('919876543210')));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { http_code: 502, message: "We couldn't send your code. Please try again in a moment." },
    });
    expect(allLogs()).toContain('TEMPLATE_ERROR');
  });

  it('returns 502 when Nimbus replies with something that is not JSON', async () => {
    const { handler } = setup(ENV, async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    expect((await handler(hookRequest(otpPayload('919876543210')))).status).toBe(502);
  });
});

describe('parseHookPhone', () => {
  it('normalises both forms and classifies the rest', () => {
    expect(parseHookPhone('919876543210')).toEqual({ kind: 'ok', mobile10: '9876543210' });
    expect(parseHookPhone('+91 98765 43210')).toEqual({ kind: 'ok', mobile10: '9876543210' });
    expect(parseHookPhone('14155552671')).toEqual({ kind: 'foreign' });
    expect(parseHookPhone('911234567890')).toEqual({ kind: 'invalid' });
    expect(parseHookPhone(undefined)).toEqual({ kind: 'invalid' });
  });
});
