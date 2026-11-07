// supabase/functions/send-sms/nimbus.ts
//
// Nimbus SMS: Indian domestic gateway on TRAI DLT-registered templates.
// Same endpoint, parameters and encoding as the AI try-on project's hook.

export const NIMBUS_URL = "https://nimbusit.biz/api/SmsApi/SendSingleApi";

export interface NimbusConfig {
  userId: string;
  password: string;
  /** DLT header, e.g. HAIROG */
  senderId: string;
  entityId: string;
  templateId: string;
  /** Exact DLT-registered text, with {otp} where the registered template has {#var#}. */
  template: string;
}

export type NimbusResult = { ok: true } | { ok: false; detail: string };

/** The carrier compares the message byte-for-byte with the registered template. */
export function buildOtpMessage(template: string, otp: string): string {
  return template.replace(/\{otp\}/g, otp);
}

/**
 * Builds the GET URL. encodeURIComponent (not URLSearchParams) so spaces go as
 * %20 rather than "+": the carrier rejects any mismatch with the DLT template
 * as TEMPLATE_ERROR. HTTPS because the credentials travel in the query string.
 */
export function buildNimbusUrl(config: NimbusConfig, mobile10: string, otp: string): string {
  const params: [string, string][] = [
    ["UserID", config.userId],
    ["Password", config.password],
    ["SenderID", config.senderId],
    ["Phno", mobile10],
    ["Msg", buildOtpMessage(config.template, otp)],
    ["EntityID", config.entityId],
    ["TemplateID", config.templateId],
  ];
  return `${NIMBUS_URL}?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

/** Strips query strings from error text: fetch errors can echo the URL, which holds the password. */
function redact(text: string): string {
  return text.replace(/\?\S*/g, "?<redacted>");
}

export async function sendViaNimbus(
  config: NimbusConfig,
  mobile10: string,
  otp: string,
  fetchFn: typeof fetch,
): Promise<NimbusResult> {
  let body: { Status?: string; Response?: { Message?: string } } | null;
  try {
    const res = await fetchFn(buildNimbusUrl(config, mobile10, otp), { method: "GET" });
    body = await res.json();
  } catch (err) {
    return { ok: false, detail: `request failed: ${redact(err instanceof Error ? err.message : String(err))}` };
  }
  if (body?.Status !== "OK") {
    return { ok: false, detail: `non-OK response: ${redact(JSON.stringify(body))}` };
  }
  return { ok: true };
}
