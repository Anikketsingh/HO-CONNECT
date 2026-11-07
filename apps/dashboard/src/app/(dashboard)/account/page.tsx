'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Alert, Button, Card, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const MIN_LENGTH = 10;

export default function AccountPage() {
  const { state } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (state.status !== 'ready') return null;
  const { admin } = state;

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH || password !== confirm) return;
    setSaving(true);
    setResult(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setResult({ ok: false, message: error.message });
    } else {
      setResult({ ok: true, message: 'Password updated. Use it next time you log in.' });
      setPassword('');
      setConfirm('');
    }
  }

  return (
    <div className="max-w-xl">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Account</p>
      <h1 className="mt-2 font-display text-4xl text-espresso">{admin.name}</h1>

      <Card className="mt-8 p-6">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-3 text-sm">
          <dt className="text-muted">Email</dt>
          <dd className="text-ink">{admin.email}</dd>
          <dt className="text-muted">Role</dt>
          <dd className="capitalize text-ink">{admin.role}</dd>
        </dl>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-2xl text-espresso">Change password</h2>
        <p className="mt-1 text-sm text-muted">
          If you were given a temporary password, replace it here. At least {MIN_LENGTH} characters.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {result ? <Alert tone={result.ok ? 'info' : 'danger'}>{result.message}</Alert> : null}
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={tooShort ? `${MIN_LENGTH - password.length} more characters needed` : undefined}
          />
          <Field
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            hint={mismatch ? "Passwords don't match" : undefined}
          />
          <Button type="submit" disabled={saving || password.length < MIN_LENGTH || password !== confirm}>
            {saving ? 'Saving…' : 'Update password'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
