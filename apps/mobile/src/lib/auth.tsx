import { meResponseSchema, type MeResponse } from '@hoc/shared';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { unregisterPush } from './push-token';
import { supabase } from './supabase';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'error'; message: string }
  | { status: 'ready'; me: MeResponse };

interface AuthContextValue {
  state: AuthState;
  signOut: () => Promise<void>;
  /** Ask the API again who this user is (after an error, or after their status changes). */
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // undefined = not read yet, null = no session
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // Keep this callback synchronous: Supabase warns against calling it back from inside.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session === undefined ? undefined : (session?.user.id ?? null);

  useEffect(() => {
    if (userId === undefined) return;
    if (userId === null) {
      setState({ status: 'signed_out' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    api('/v1/me', meResponseSchema)
      .then((me) => {
        if (!cancelled) setState({ status: 'ready', me });
      })
      .catch(async (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          await supabase.auth.signOut();
          return;
        }
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const signOut = useCallback(async () => {
    await unregisterPush(); // while we are still logged in
    await supabase.auth.signOut();
  }, []);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  return <AuthContext.Provider value={{ state, signOut, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
