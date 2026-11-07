import Constants from 'expo-constants';

const extra: Record<string, unknown> = Constants.expoConfig?.extra ?? {};
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export const SUPABASE_URL = str(extra.supabaseUrl);
export const SUPABASE_ANON_KEY = str(extra.supabaseAnonKey);

/**
 * In development the phone reaches the API on the computer running `expo start`:
 * Expo tells us that computer's LAN address (hostUri, e.g. "192.168.1.20:8081").
 */
function devApiUrl(): string | null {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:4000` : null;
}

export const API_URL = str(extra.apiUrl) || devApiUrl() || 'http://localhost:4000';

/** Where the public pages (privacy policy, QR landing page) live. In development: the same computer, port 3000. */
export const WEB_URL = str(extra.webUrl) || API_URL.replace(/:4000$/, ':3000');
