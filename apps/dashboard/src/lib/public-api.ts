import { apiErrorSchema } from '@hoc/shared';
import { ApiError } from './api';
import { API_URL } from './env';

interface Parser<T> {
  parse(value: unknown): T;
}

/** Calls the API without any login: for the customer-facing QR / link page. */
export async function publicApi<T>(path: string, schema: Parser<T>, json?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/public${path}`, {
      method: json === undefined ? 'GET' : 'POST',
      headers: json === undefined ? {} : { 'Content-Type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch {
    throw new ApiError(0, 'network_error', "We couldn't connect. Please check your internet and try again.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiError(
      res.status,
      parsed.success ? parsed.data.error.code : 'http_error',
      res.status === 404 ? 'This link is not active. Please ask for a new one.' : parsed.success ? parsed.data.error.message : 'Something went wrong. Please try again.',
    );
  }
  return schema.parse(body);
}
