'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Alert, Button, Card, Field, Logo } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const { state, retry } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state.status === 'ready') router.replace('/');
  }, [state.status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : signInError.message,
      );
    }
    // On success the AuthProvider asks the API for dashboard access, and the effect above redirects.
  }

  const busy = submitting || state.status === 'loading';

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-blush p-12 lg:flex">
        <Logo className="w-36" />
        <div className="max-w-md">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary">HO Connect</p>
          <h1 className="font-display text-5xl leading-[1.1] text-espresso">
            Partners bring the referral. We take it from there.
          </h1>
          <p className="mt-6 text-[17px] leading-relaxed text-muted">
            Review partner applications, work the leads they send, and track every commission through to payout.
          </p>
        </div>
        <p className="text-sm text-muted">Krisoriginals Pvt Ltd · Internal use only</p>
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-brass-soft/40" />
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Logo className="mx-auto mb-8 w-32 lg:hidden" />
          <h2 className="font-display text-3xl text-espresso">Log in</h2>
          <p className="mt-2 text-sm text-muted">Use the email and password from your invitation.</p>

          <Card className="mt-8 p-6">
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {state.status === 'signed_out' && state.notice ? <Alert tone="info">{state.notice}</Alert> : null}
              {state.status === 'error' ? (
                <Alert>
                  {state.message}{' '}
                  <button type="button" onClick={retry} className="font-semibold underline">
                    Try again
                  </button>
                </Alert>
              ) : null}
              {error ? <Alert>{error}</Alert> : null}

              <Field
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@hairoriginals.com"
              />
              <Field
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={busy || !email || !password}>
                {submitting ? 'Logging in…' : 'Log in'}
              </Button>
            </form>
          </Card>

          <p className="mt-6 text-center text-xs text-muted">
            Access is by invitation. Ask an HO admin if you need an account.
          </p>
        </div>
      </section>
    </main>
  );
}
