// supabase/functions/send-sms/webhook.ts
//
// Standard Webhooks signature check (https://www.standardwebhooks.com), the
// scheme Supabase Auth uses to sign hook requests. Written with Web Crypto so
// there is no third-party import and it runs the same in Deno and Node.

const TOLERANCE_SECONDS = 5 * 60;
const encoder = new TextEncoder();

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * True when the request carries a valid signature for this exact body, made
 * within the last five minutes.
 *
 * `secret` is the value the Supabase dashboard shows for the hook: "v1,whsec_<base64>".
 */
export async function verifyStandardWebhook(
  secret: string,
  headers: Headers,
  body: string,
  nowSeconds: number,
): Promise<boolean> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures) return false;
  if (!/^\d+$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const keyBytes = base64ToBytes(secret.trim().replace(/^v1,/, "").replace(/^whsec_/, ""));
  if (!keyBytes || keyBytes.length === 0) return false;

  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = encoder.encode(`${id}.${timestamp}.${body}`);

  // The header can hold several space-separated "v1,<base64>" signatures (secret rotation).
  // subtle.verify compares in constant time.
  for (const entry of signatures.split(" ")) {
    const [version, sig] = entry.split(",", 2);
    if (version !== "v1" || !sig) continue;
    const sigBytes = base64ToBytes(sig);
    if (sigBytes && (await crypto.subtle.verify("HMAC", key, sigBytes, signed))) return true;
  }
  return false;
}
