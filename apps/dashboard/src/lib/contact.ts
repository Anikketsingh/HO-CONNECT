import { DEFAULT_SETTINGS, publicContactSchema } from '@hoc/shared';
import { API_URL } from './env';

/** Seconds the public pages keep the support email before asking the API again. */
export const CONTACT_REVALIDATE_SECONDS = 300;

/**
 * The support email set in Settings → General, for the public privacy and account-deletion pages.
 * Read on the server; falls back to the default if the API can't be reached (for example during a build).
 */
export async function getSupportEmail(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/v1/public/contact`, {
      next: { revalidate: CONTACT_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return publicContactSchema.parse(await res.json()).supportEmail;
  } catch {
    return DEFAULT_SETTINGS.support_email;
  }
}
