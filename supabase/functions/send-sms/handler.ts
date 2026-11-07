// supabase/functions/send-sms/handler.ts
//
// Supabase Auth "Send SMS" hook for HO Connect partner login.
//
// Supabase Auth still generates, stores and verifies the OTP and issues the
// session. It only hands over delivery: on signInWithOtp() it POSTs
// { user, sms: { otp } } here, signed with Standard Webhooks, and we send the
// code through Nimbus on the DLT-registered template.
//
// Same provider, sender, entity and template as the AI try-on hook. Partners
// are Indian, so this version is India-only: no Twilio route, and anything that
// is not a valid +91 mobile is refused before Nimbus is called, so a refused
// number costs nothing. signInWithOtp() goes app → Supabase directly, so this
// is the only server-side code on the send path.
//
// No Deno APIs in this file, so supabase/tests can run it under Node.

import { type NimbusConfig, sendViaNimbus } from "./nimbus.ts";
import { verifyStandardWebhook } from "./webhook.ts";

export interface SendSmsDeps {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  /** Current Unix time in seconds (injectable for tests). */
  now?: () => number;
}

interface HookPayload {
  user?: { phone?: string };
  sms?: { otp?: string };
}

const NIMBUS_ENV: Record<keyof NimbusConfig, string> = {
  userId: "NIMBUS_USER_ID",
  password: "NIMBUS_PASSWORD",
  senderId: "NIMBUS_SENDER_ID",
  entityId: "NIMBUS_ENTITY_ID",
  templateId: "NIMBUS_TEMPLATE_ID",
  template: "NIMBUS_OTP_TEMPLATE",
};

const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const NOT_CONFIGURED = "SMS login is not set up yet. Please try again later.";

export type HookPhone = { kind: "ok"; mobile10: string } | { kind: "foreign" } | { kind: "invalid" };

/**
 * Supabase hands the hook bare digits with the country code ("919876543210"),
 * not the "+91…" the app passed to signInWithOtp(). Both forms are accepted.
 */
export function parseHookPhone(phone: string | undefined): HookPhone {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return { kind: "invalid" };
  if (!digits.startsWith("91")) return { kind: "foreign" };
  const mobile10 = digits.slice(2);
  return INDIAN_MOBILE.test(mobile10) ? { kind: "ok", mobile10 } : { kind: "invalid" };
}

function readNimbusConfig(env: SendSmsDeps["env"]): NimbusConfig | null {
  const config = {} as NimbusConfig;
  const missing: string[] = [];
  for (const [field, name] of Object.entries(NIMBUS_ENV) as [keyof NimbusConfig, string][]) {
    const value = env(name)?.trim();
    if (value) config[field] = value;
    else missing.push(name);
  }
  if (missing.length) {
    console.error(`[send-sms] missing secrets: ${missing.join(", ")}`);
    return null;
  }
  if (!config.template.includes("{otp}")) {
    console.error("[send-sms] NIMBUS_OTP_TEMPLATE has no {otp} placeholder");
    return null;
  }
  return config;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Error in the shape Supabase Auth expects. Without `http_code` in the body,
 * Auth turns every failure into a bare 500 and the message is lost.
 */
function fail(status: number, message: string): Response {
  return json({ error: { http_code: status, message } }, status);
}

/** "9876543210" → "******3210" for logs. Never log the full number or the OTP. */
function forLog(mobile10: string): string {
  return `******${mobile10.slice(-4)}`;
}

export function createSendSmsHandler(deps: SendSmsDeps): (request: Request) => Promise<Response> {
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));

  return async function handleSendSms(request) {
    if (request.method !== "POST") return fail(405, "Method not allowed");

    const secret = deps.env("SEND_SMS_HOOK_SECRET");
    if (!secret) {
      console.error("[send-sms] SEND_SMS_HOOK_SECRET is not set");
      return fail(500, NOT_CONFIGURED);
    }

    const rawBody = await request.text();
    if (!(await verifyStandardWebhook(secret, request.headers, rawBody, now()))) {
      console.error("[send-sms] rejected: missing, stale or invalid signature");
      return fail(401, "Invalid signature");
    }

    let payload: HookPayload;
    try {
      payload = JSON.parse(rawBody) as HookPayload;
    } catch {
      return fail(400, "Invalid payload");
    }

    const otp = payload.sms?.otp;
    if (!otp || !/^\d{4,10}$/.test(otp)) return fail(400, "Missing or invalid OTP in payload");

    const phone = parseHookPhone(payload.user?.phone);
    if (phone.kind === "foreign") return fail(403, "HO Connect works with Indian mobile numbers only.");
    if (phone.kind === "invalid") return fail(400, "Please enter a valid 10-digit mobile number.");

    const config = readNimbusConfig(deps.env);
    if (!config) return fail(500, NOT_CONFIGURED);

    const result = await sendViaNimbus(config, phone.mobile10, otp, deps.fetch);
    if (!result.ok) {
      console.error(`[send-sms] nimbus failed for ${forLog(phone.mobile10)}: ${result.detail}`);
      return fail(502, "We couldn't send your code. Please try again in a moment.");
    }

    console.log(`[send-sms] sent to ${forLog(phone.mobile10)}`);
    return json({}, 200);
  };
}
