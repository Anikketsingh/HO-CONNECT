'use client';

import { CUSTOMER_TYPES, LEAD_STAGES, settingsResponseSchema } from '@hoc/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { inputClass, Labeled, SettingsTabs } from '@/components/settings-tabs';
import { Alert, Button, Card, PageHeader, Spinner } from '@/components/ui';
import { api, apiSend, errorMessage } from '@/lib/api';
import { CUSTOMER_TYPE_LABELS, paiseToInput, rupeesToPaiseInput, STAGE_LABELS } from '@/lib/format';

type Values = Record<string, unknown>;

const NUMBERS: { key: string; label: string; hint: string; unit?: 'rupees' | 'percent' }[] = [
  { key: 'ownership_window_days', label: 'Ownership window (days)', hint: 'How long a confirmed lead is credited to the partner' },
  { key: 'consent_expiry_hours', label: 'Consent expiry (hours)', hint: 'Unconfirmed leads close after this' },
  { key: 'consent_max_resends', label: 'Code resends', hint: 'How many times a partner can resend the consent code' },
  { key: 'hold_days', label: 'Hold period (days)', hint: 'Before a commission can be approved' },
  { key: 'commissionable_sales_per_lead', label: 'Commissionable sales per lead', hint: '1 = first purchase only' },
  { key: 'max_leads_per_partner_per_day', label: 'Leads per partner per day', hint: 'Fraud guard' },
  { key: 'min_payout_paise', label: 'Minimum payout (₹)', hint: 'Smaller balances roll over to the next payout', unit: 'rupees' },
  { key: 'tds_bps', label: 'TDS on payouts (%)', hint: 'Deducted from each payout. Confirm the rate with finance; 0 deducts nothing', unit: 'percent' },
  { key: 'max_public_leads_per_day', label: 'QR / link referrals per day', hint: 'Across all partners; protects against SMS abuse on the public page' },
];
const SWITCHES: { key: string; label: string; hint: string }[] = [
  { key: 'require_customer_otp', label: 'Require customer OTP', hint: 'Customers confirm consent with a code. Keep this on.' },
  { key: 'auto_approve_unflagged', label: 'Auto-approve unflagged commissions after the hold', hint: 'Off for the pilot' },
];

export default function GeneralSettingsPage() {
  const { state } = useAuth();
  const canEdit = state.status === 'ready' && state.admin.role === 'admin';
  const [defaults, setDefaults] = useState<Values | null>(null);
  const [saved, setSaved] = useState<Values | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [stageLabels, setStageLabels] = useState<Record<string, string>>({});
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api('/v1/admin/settings', settingsResponseSchema);
      setDefaults(s.defaults);
      setSaved(s.values);
      const f: Record<string, string | boolean> = {};
      for (const n of NUMBERS) {
        const v = s.values[n.key] as number;
        f[n.key] = n.unit === 'rupees' ? paiseToInput(v) : n.unit === 'percent' ? String(v / 100) : String(v);
      }
      for (const sw of SWITCHES) f[sw.key] = Boolean(s.values[sw.key]);
      f.support_email = String(s.values.support_email ?? '');
      setForm(f);
      setStageLabels({ ...(s.values.stage_labels as Record<string, string>) });
      setTypeLabels({ ...(s.values.customer_type_labels as Record<string, string>) });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!saved || !defaults) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const body: Values = {};
    for (const n of NUMBERS) {
      const raw = String(form[n.key]);
      const v = n.unit === 'rupees' ? rupeesToPaiseInput(raw) : n.unit === 'percent' ? Math.round(Number(raw) * 100) : Number(raw);
      if (v !== saved[n.key]) body[n.key] = v;
    }
    for (const sw of SWITCHES) if (form[sw.key] !== saved[sw.key]) body[sw.key] = form[sw.key];
    const supportEmail = String(form.support_email ?? '').trim();
    if (supportEmail !== saved.support_email) body.support_email = supportEmail;
    // Store only labels that differ from the default wording.
    const diff = (cur: Record<string, string>, def: Record<string, string>) =>
      Object.fromEntries(Object.entries(cur).filter(([k, v]) => v.trim() && v.trim() !== def[k]).map(([k, v]) => [k, v.trim()]));
    body.stage_labels = diff(stageLabels, defaults.stage_labels as Record<string, string>);
    body.customer_type_labels = diff(typeLabels, defaults.customer_type_labels as Record<string, string>);
    try {
      await apiSend('/v1/admin/settings', { method: 'PUT', json: body });
      setNotice('Settings saved. They apply to new leads and sales from now on.');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!defaults || !saved) {
    return (
      <div>
        <PageHeader eyebrow="Settings" title="General" />
        <div className="mt-6">
          <SettingsTabs />
        </div>
        {error ? <Alert>{error}</Alert> : <Spinner />}
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Settings" title="General" />
      <div className="mt-6">
        <SettingsTabs />
      </div>
      <div className="space-y-3">
        {!canEdit ? <Alert tone="info">Only admins can change these settings.</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}
      </div>

      <fieldset disabled={!canEdit} className="mt-6 space-y-6">
        <Card className="p-5">
          <h2 className="font-semibold text-espresso">Rules</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {NUMBERS.map((n) => (
              <Labeled key={n.key} label={n.label}>
                <input className={inputClass} inputMode="numeric" value={String(form[n.key] ?? '')} onChange={(e) => setForm({ ...form, [n.key]: e.target.value })} />
                <span className="font-normal">
                  {n.hint}. Default {n.unit === 'rupees' ? `₹${paiseToInput(defaults[n.key] as number)}` : n.unit === 'percent' ? `${(defaults[n.key] as number) / 100}%` : String(defaults[n.key])}.
                </span>
              </Labeled>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            {SWITCHES.map((s) => (
              <label key={s.key} className="flex items-start gap-3 text-sm text-ink">
                <input type="checkbox" className="mt-1" checked={Boolean(form[s.key])} onChange={(e) => setForm({ ...form, [s.key]: e.target.checked })} />
                <span>
                  <span className="font-medium">{s.label}</span>
                  <span className="block text-xs text-muted">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-espresso">Contact</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Labeled label="Support email">
              <input
                className={inputClass}
                type="email"
                autoComplete="off"
                value={String(form.support_email ?? '')}
                onChange={(e) => setForm({ ...form, support_email: e.target.value })}
              />
              <span className="font-normal">
                Shown on the public privacy policy and account deletion pages (Google Play links to both) for privacy and deletion requests. Updates there within 5
                minutes. Default {String(defaults.support_email)}.
              </span>
            </Labeled>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-espresso">What partners see</h2>
          <p className="mt-1 text-sm text-muted">The wording in the partner app. Leave a field as it is to keep the default.</p>
          <h3 className="mt-4 text-sm font-semibold text-ink">Customer types</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {CUSTOMER_TYPES.map((t) => (
              <Labeled key={t} label={CUSTOMER_TYPE_LABELS[t] ?? t}>
                <input className={inputClass} value={typeLabels[t] ?? ''} onChange={(e) => setTypeLabels({ ...typeLabels, [t]: e.target.value })} />
              </Labeled>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Keep both "existing" types worded the same: telling a partner that someone has bought from HO discloses their purchase
            history.
          </p>
          <h3 className="mt-5 text-sm font-semibold text-ink">Lead stages</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LEAD_STAGES.map((st) => (
              <Labeled key={st} label={STAGE_LABELS[st] ?? st}>
                <input className={inputClass} value={stageLabels[st] ?? ''} onChange={(e) => setStageLabels({ ...stageLabels, [st]: e.target.value })} />
              </Labeled>
            ))}
          </div>
        </Card>
      </fieldset>

      {canEdit ? (
        <Button className="mt-6" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </Button>
      ) : null}
    </div>
  );
}
