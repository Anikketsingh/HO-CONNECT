'use client';

import { meResponseSchema, type MeResponse } from '@hoc/shared';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export type AdminProfile = Extract<MeResponse, { kind: 'admin' }>;

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out'; notice?: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; admin: AdminProfile };

interface AuthContextValue {
  state: AuthState;
  signOut: () => Promise<void>;
  retry: () => void;
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

  // Ask the API whether this user may use the dashboard. Runs when the user changes, not on every token refresh.
  useEffect(() => {
    if (userId === undefined) return;
    if (userId === null) {
      setState((s) => (s.status === 'signed_out' ? s : { status: 'signed_out' }));
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    api('/v1/admin/me', meResponseSchema)
      .then((me) => {
        if (cancelled) return;
        if (me.kind === 'admin') setState({ status: 'ready', admin: me });
        else void deny('This account does not have dashboard access.');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          void deny(
            err.status === 403
              ? 'This account does not have dashboard access. Ask an HO admin to invite you.'
              : 'Your session has expired. Please log in again.',
          );
        } else {
          setState({ status: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  async function deny(notice: string) {
    await supabase.auth.signOut();
    setState({ status: 'signed_out', notice });
  }

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ status: 'signed_out' });
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return <AuthContext.Provider value={{ state, signOut, retry }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
