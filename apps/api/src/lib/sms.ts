import { maskPhone } from '@hoc/shared';

/**
 * Transactional SMS from the API (customer consent OTP). Partner login OTPs are
 * sent by the Supabase send-sms hook, not here.
 *
 * Indian carriers only deliver text that matches a DLT-registered template, so the
 * body comes from the `message_templates` row and `providerTemplateId` is its DLT id.
 */
export interface SmsMessage {
  /** 10-digit Indian mobile. */
  to: string;
  body: string;
  providerTemplateId: string | null;
}

export type SmsResult = { ok: true; providerRef: string | null } | { ok: false; error: string };

export interface SmsSender {
  readonly name: 'console' | 'nimbus';
  send(message: SmsMessage): Promise<SmsResult>;
}

/** Development: prints the message to the API log instead of sending it. */
export function createConsoleSms(log: (line: string) => void): SmsSender {
  return {
    name: 'console',
    async send(m) {
      log(`[sms:console] to ${maskPhone(m.to)}: ${m.body}`);
      return { ok: true, providerRef: null };
    },
  };
}

const NIMBUS_URL = 'https://nimbusit.biz/api/SmsApi/SendSingleApi';

/** Same gateway, credentials and request format as the partner-login hook (supabase/functions/send-sms). */
export function createNimbusSms(
  cfg: { userId: string; password: string; senderId: string; entityId: string },
  fetchFn: typeof fetch = fetch,
): SmsSender {
  return {
    name: 'nimbus',
    async send(m) {
      if (!m.providerTemplateId) {
        return { ok: false, error: 'No DLT template id set for this message template' };
      }
      // encodeURIComponent, not URLSearchParams: spaces must be %20 for the DLT byte-for-byte match.
      const query = (
        [
          ['UserID', cfg.userId],
          ['Password', cfg.password],
          ['SenderID', cfg.senderId],
          ['Phno', m.to],
          ['Msg', m.body],
          ['EntityID', cfg.entityId],
          ['TemplateID', m.providerTemplateId],
        ] as const
      )
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      try {
        const res = await fetchFn(`${NIMBUS_URL}?${query}`, { method: 'GET', signal: AbortSignal.timeout(10_000) });
        const body = (await res.json().catch(() => null)) as { Status?: string; Response?: { Message?: string; Id?: string } } | null;
        if (body?.Status !== 'OK') {
          return { ok: false, error: `Nimbus: ${body?.Response?.Message ?? `HTTP ${res.status}`}` };
        }
        return { ok: true, providerRef: body.Response?.Id ?? null };
      } catch (err) {
        // Fetch errors can echo the URL, which contains the password: keep only the error name.
        return { ok: false, error: `Nimbus request failed (${err instanceof Error ? err.name : 'error'})` };
      }
    },
  };
}

/** Fills {{placeholders}}. DLT variables are limited to 30 characters each. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in vars ? vars[key]!.slice(0, 30) : match));
}
