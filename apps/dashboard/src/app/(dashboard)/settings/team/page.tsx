'use client';

import { teamCreateResponseSchema, teamListSchema, type TeamMember } from '@hoc/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { inputClass, Labeled, SettingsTabs } from '@/components/settings-tabs';
import { Alert, Button, Card, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, apiSend, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

export default function TeamPage() {
  const { state } = useAuth();
  const isAdmin = state.status === 'ready' && state.admin.role === 'admin';
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string | null } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'agent' as 'agent' | 'admin' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers((await api('/v1/admin/team', teamListSchema)).items);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      await load();
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Team" />
      <div className="mt-6">
        <SettingsTabs />
      </div>
      <p className="max-w-3xl text-muted">
        Who can log in to this dashboard. <b>Admins</b> can do everything, including money and settings. <b>Agents</b> verify leads, work them and
        record sales, but can't approve commissions, change settings or pay anyone.
      </p>
      <div className="mt-6 space-y-3">
        {state.status === 'ready' && !isAdmin ? <Alert tone="info">Only admins can manage the team.</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
        {created ? (
          <Alert tone="info">
            <span className="font-semibold">{created.email} was added.</span>{' '}
            {created.password ? (
              <>
                Give them this temporary password: <span className="select-all rounded bg-white px-1.5 py-0.5 font-mono">{created.password}</span>. It is shown only now. They should change it
                under Account after logging in.
              </>
            ) : (
              'They already had a login, so they keep their current password.'
            )}
          </Alert>
        ) : null}
      </div>

      {isAdmin ? (
        <>
          <Card className="mt-6 p-5">
            <h2 className="font-semibold text-espresso">Add someone</h2>
            <form
              className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_1.5fr_1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                void run(async () => {
                  const r = await api('/v1/admin/team', teamCreateResponseSchema, { method: 'POST', json: form });
                  setCreated({ email: form.email.toLowerCase(), password: r.tempPassword });
                  setForm({ name: '', email: '', role: 'agent' });
                }).finally(() => setBusy(false));
              }}
            >
              <Labeled label="Name">
                <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Labeled>
              <Labeled label="Email">
                <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Labeled>
              <Labeled label="Role">
                <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'agent' | 'admin' })}>
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </Labeled>
              <Button type="submit" disabled={busy || form.name.trim().length < 2 || !form.email.includes('@')}>
                Add
              </Button>
            </form>
          </Card>

          <Card className="mt-6 overflow-hidden">
            {!members ? (
              <div className="p-5">
                <Spinner />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">Person</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-ink">{m.name}</span>
                        {m.isYou ? <span className="ml-2 text-xs text-muted">(you)</span> : null}
                        <span className="block text-xs text-muted">
                          {m.email} · added {formatDate(m.createdAt)}
                        </span>
                      </td>
                      <td className="px-3 py-3 capitalize">{m.role}</td>
                      <td className="px-3 py-3">
                        <Pill tone={m.active ? 'good' : 'bad'}>{m.active ? 'Active' : 'Deactivated'}</Pill>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {m.isYou ? null : (
                          <span className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => run(() => apiSend(`/v1/admin/team/${m.id}`, { method: 'PATCH', json: { role: m.role === 'admin' ? 'agent' : 'admin' } }))}>
                              Make {m.role === 'admin' ? 'agent' : 'admin'}
                            </Button>
                            <Button
                              size="sm"
                              variant={m.active ? 'danger' : 'outline'}
                              onClick={() => {
                                if (!m.active || window.confirm(`Deactivate ${m.name}? They are logged out of the dashboard straight away.`)) {
                                  void run(() => apiSend(`/v1/admin/team/${m.id}`, { method: 'PATCH', json: { active: !m.active } }));
                                }
                              }}
                            >
                              {m.active ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
