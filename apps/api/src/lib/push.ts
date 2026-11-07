/** Push notifications through Expo's push service. Tokens come from the partner app. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}
export type PushResult = { ok: true } | { ok: false; invalidToken: boolean; error: string };

export interface PushSender {
  readonly name: 'console' | 'expo';
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

export function createConsolePush(log: (line: string) => void): PushSender {
  return {
    name: 'console',
    async send(messages) {
      for (const m of messages) log(`[push:console] ${m.title}: ${m.body}`);
      return messages.map(() => ({ ok: true as const }));
    },
  };
}

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

export function createExpoPush(opts: { accessToken?: string } = {}, fetchFn: typeof fetch = fetch): PushSender {
  return {
    name: 'expo',
    async send(messages) {
      const results: PushResult[] = [];
      for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        try {
          const res = await fetchFn(EXPO_URL, {
            method: 'POST',
            signal: AbortSignal.timeout(10_000),
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...(opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {}),
            },
            body: JSON.stringify(chunk.map((m) => ({ ...m, sound: 'default', priority: 'high' }))),
          });
          const body = (await res.json().catch(() => null)) as { data?: { status: string; message?: string; details?: { error?: string } }[] } | null;
          if (!res.ok || !body?.data) {
            results.push(...chunk.map(() => ({ ok: false as const, invalidToken: false, error: `Expo push HTTP ${res.status}` })));
            continue;
          }
          for (const t of body.data) {
            results.push(
              t.status === 'ok'
                ? { ok: true }
                : { ok: false, invalidToken: t.details?.error === 'DeviceNotRegistered', error: t.message ?? t.details?.error ?? 'error' },
            );
          }
        } catch (err) {
          results.push(...chunk.map(() => ({ ok: false as const, invalidToken: false, error: `Expo push failed (${err instanceof Error ? err.name : 'error'})` })));
        }
      }
      return results;
    },
  };
}
