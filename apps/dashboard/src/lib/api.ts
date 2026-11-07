import { apiErrorSchema } from '@hoc/shared';
import { API_URL } from './env';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Parser<T> {
  parse(value: unknown): T;
}

type Init = Omit<RequestInit, 'body'> & { json?: unknown };

async function request(path: string, init: Init = {}): Promise<unknown> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const { json, ...rest } = init;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      body: json !== undefined ? JSON.stringify(json) : undefined,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...rest.headers,
      },
    });
  } catch (err) {
    // A blocked cross-origin request (CORS) looks the same as a stopped server in the browser, so say which it might be.
    throw new ApiError(0, 'network_error', `Can't reach the API at ${API_URL}. Is it running (npm run dev:api)? If it is, check that ${typeof window === 'undefined' ? 'this address' : window.location.origin} is listed in CORS_ORIGINS in .env. (${err instanceof Error ? err.message : 'network error'})`);
  }

  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiError(
      res.status,
      parsed.success ? parsed.data.error.code : 'http_error',
      parsed.success ? parsed.data.error.message : `Request failed (${res.status})`,
    );
  }
  return body;
}

/** Calls the HO Connect API with the current Supabase access token and validates the response. */
export async function api<T>(path: string, schema: Parser<T>, init: Init = {}): Promise<T> {
  return schema.parse(await request(path, init));
}

/** For calls whose response body we don't need (204s and simple acknowledgements). */
export async function apiSend(path: string, init: Init): Promise<void> {
  await request(path, init);
}

/** Downloads a file the API protects (e.g. the finance CSV): sends the login, then saves the result. */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
  } catch {
    throw new ApiError(0, 'network_error', `Can't reach the API at ${API_URL}. Is it running? (npm run dev:api)`);
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiError(res.status, parsed.success ? parsed.data.error.code : 'http_error', parsed.success ? parsed.data.error.message : `Download failed (${res.status})`);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
