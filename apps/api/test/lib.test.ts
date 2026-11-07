import { describe, expect, it, vi } from 'vitest';
import { csvToRecords, parseCsv } from '../src/lib/csv';
import { createNimbusSms, renderTemplate } from '../src/lib/sms';
import { parseIstDateTime } from '../src/services/leads';

describe('renderTemplate', () => {
  it('fills placeholders, caps each value at the 30-character DLT limit, and leaves unknown ones', () => {
    const body = '{{otp}} is your OTP to confirm your referral to HairOriginals by {{partner_name}}. {{other}}';
    expect(renderTemplate(body, { otp: '482913', partner_name: 'The Very Long Name Unisex Salon And Spa' })).toBe(
      '482913 is your OTP to confirm your referral to HairOriginals by The Very Long Name Unisex Salo. {{other}}',
    );
  });
});

describe('createNimbusSms', () => {
  const cfg = { userId: 'hoc', password: 's3cret pass', senderId: 'HAIROG', entityId: '1701', templateId: undefined };

  it('sends the DLT template id and encodes spaces as %20', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ Status: 'OK', Response: { Id: 'abc' } }));
    const sms = createNimbusSms(cfg, fetchFn);
    expect(await sms.send({ to: '9876543210', body: '123456 is your OTP', providerTemplateId: '1707' })).toEqual({ ok: true, providerRef: 'abc' });
    const url = String(fetchFn.mock.calls[0]![0]);
    expect(url).toContain('Msg=123456%20is%20your%20OTP');
    expect(url).toContain('TemplateID=1707');
    expect(url).toContain('Phno=9876543210');
    expect(url).not.toContain('+is+');
  });

  it('refuses to send without a DLT template id', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const r = await createNimbusSms(cfg, fetchFn).send({ to: '9876543210', body: 'x', providerTemplateId: null });
    expect(r.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('never puts the request URL (with the password) in the error', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      throw new TypeError(`error sending request for url (${String(input)})`);
    });
    const r = await createNimbusSms(cfg, fetchFn).send({ to: '9876543210', body: 'x', providerTemplateId: '1707' });
    expect(r).toEqual({ ok: false, error: 'Nimbus request failed (TypeError)' });
  });

  it('reports a non-OK gateway response', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ Status: 'ERROR', Response: { Message: 'TEMPLATE_ERROR' } }));
    expect(await createNimbusSms(cfg, fetchFn).send({ to: '9876543210', body: 'x', providerTemplateId: '1707' })).toEqual({
      ok: false,
      error: 'Nimbus: TEMPLATE_ERROR',
    });
  });
});

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and newlines in quotes, CRLF and a BOM', () => {
    const text = '﻿lead_ref,note\r\nL-1,"Booked, Lajpat Nagar"\r\nL-2,"She said ""call later""\nthen hung up"\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ['lead_ref', 'note'],
      ['L-1', 'Booked, Lajpat Nagar'],
      ['L-2', 'She said "call later"\nthen hung up'],
    ]);
  });

  it('normalises headers', () => {
    expect(csvToRecords('Lead Ref,Consultation-Mode\nL-1,video').records).toEqual([{ lead_ref: 'L-1', consultation_mode: 'video' }]);
  });
});

describe('parseIstDateTime', () => {
  it('reads common spreadsheet formats as India time', () => {
    expect(parseIstDateTime('2026-11-20 16:30')).toBe('2026-11-20T11:00:00.000Z');
    expect(parseIstDateTime('20/11/2026 16:30')).toBe('2026-11-20T11:00:00.000Z');
    expect(parseIstDateTime('2026-11-20')).toBe('2026-11-20T04:30:00.000Z'); // 10:00 IST when no time is given
    expect(parseIstDateTime('2026-11-20T16:30:00Z')).toBe('2026-11-20T16:30:00.000Z');
    expect(parseIstDateTime('next tuesday')).toBeNull();
    expect(parseIstDateTime('2026-11-20T16:30')).toBe('2026-11-20T11:00:00.000Z');
  });
});
