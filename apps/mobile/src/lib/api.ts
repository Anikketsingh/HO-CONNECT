import { apiErrorSchema } from '@hoc/shared';
import { API_URL } from './config';
import { t } from '@/i18n';
import { supabase } from './supabase';
import { appendFile } from './upload-part';

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

type Init = { method?: string; json?: unknown; form?: FormData; timeoutMs?: number };

async function request(path: string, init: Init = {}): Promise<unknown> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      signal: controller.signal,
      // For FormData, React Native sets the multipart Content-Type (with boundary) itself.
      body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
      headers: {
        ...(init.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (err) {
    // In development, say what really failed: "can't reach" is misleading when the cause is something else.
    const detail = __DEV__ && err instanceof Error ? ` (${err.name}: ${err.message})` : '';
    throw new ApiError(0, 'network_error', `Can't reach HO Connect at ${API_URL}.${detail}`);
  } finally {
    clearTimeout(timer);
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

export async function apiSend(path: string, init: Init): Promise<void> {
  await request(path, init);
}

/** Uploads a local file (camera, photo library or document picker) as multipart/form-data. */
export async function uploadFile<T>(
  path: string,
  file: { uri: string; name: string; mimeType: string },
  schema: Parser<T>,
): Promise<T> {
  const form = new FormData();
  await appendFile(form, file);
  return api(path, schema, { method: 'POST', form, timeoutMs: 60_000 });
}

export function errorMessage(err: unknown): string {
  return t(err instanceof Error ? err.message : 'Something went wrong.');
}
