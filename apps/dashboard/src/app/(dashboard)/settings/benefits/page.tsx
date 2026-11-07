'use client';

import { BENEFIT_TYPE_LABELS, BENEFIT_TYPES, benefitListSchema, planListSchema, type BenefitList, type PlanList } from '@hoc/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { inputClass, Labeled, SettingsTabs } from '@/components/settings-tabs';
import { Alert, Button, Card, cx, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, apiSend, errorMessage } from '@/lib/api';
import { formatDate, paiseToInput, rupeesToPaiseInput } from '@/lib/format';

type Benefit = BenefitList['items'][number];
type BenefitType = (typeof BENEFIT_TYPES)[number];

interface Form {
  name: string;
  type: BenefitType;
  value: string;
  categoryIds: string[];
  partnerTypeIds: string[];
  cities: string;
  customerText: string;
  partnerText: string;
  activeFrom: string;
  activeTo: string;
  priority: string;
}

const empty: Form = {
  name: '',
  type: 'waive_trial_fee',
  value: '',
  categoryIds: [],
  partnerTypeIds: [],
  cities: '',
  customerText: '',
  partnerText: '',
  activeFrom: '',
  activeTo: '',
  priority: '0',
};

const toForm = (b: Benefit): Form => ({
  name: b.name,
  type: b.type,
  value: b.type === 'percent_off' ? String((b.value ?? 0) / 100) : b.type === 'flat_off' ? paiseToInput(b.value) : '',
  categoryIds: b.categoryIds,
  partnerTypeIds: b.partnerTypeIds,
  cities: b.cities.join(', '),
  customerText: b.customerText,
  partnerText: b.partnerText ?? '',
  activeFrom: b.activeFrom ?? '',
  activeTo: b.activeTo ?? '',
  priority: String(b.priority),
});

const toBody = (f: Form) => ({
  name: f.name.trim(),
  type: f.type,
  value: f.type === 'percent_off' ? Math.round(Number(f.value) * 100) : f.type === 'flat_off' ? rupeesToPaiseInput(f.value) : null,
  categoryIds: f.categoryIds,
  partnerTypeIds: f.partnerTypeIds,
  cities: f.cities.split(',').map((c) => c.trim()).filter(Boolean),
  customerText: f.customerText.trim(),
  partnerText: f.partnerText.trim() || null,
  activeFrom: f.activeFrom || null,
  activeTo: f.activeTo || null,
  priority: Number(f.priority) || 0,
});

function Checks({ options, value, onChange, none }: { options: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; none: string }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-1.5">
          <input type="checkbox" checked={value.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))} />
          {o.name}
        </label>
      ))}
      {value.length === 0 ? <span className="text-xs text-muted">{none}</span> : null}
    </div>
  );
}

function BenefitForm({ initial, meta, onSave, onCancel }: { initial: Form; meta: PlanList; onSave: (b: ReturnType<typeof toBody>) => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(toBody(f));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-paper p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label="Name (internal)">
          <input className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Labeled>
        <Labeled label="Type">
          <select className={inputClass} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as BenefitType })}>
            {BENEFIT_TYPES.filter((t) => t !== 'none').map((t) => (
              <option key={t} value={t}>
                {BENEFIT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Labeled>
        {f.type === 'percent_off' || f.type === 'flat_off' ? (
          <Labeled label={f.type === 'percent_off' ? 'Percent off' : 'Rupees off'}>
            <input className={inputClass} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          </Labeled>
        ) : null}
      </div>
      <Labeled label="What the customer sees (consent message, landing page)">
        <input className={inputClass} value={f.customerText} onChange={(e) => setF({ ...f, customerText: e.target.value })} placeholder="Free home trial when you visit through your salon" />
      </Labeled>
      <Labeled label='What the partner sees ("Tell your customer: …")'>
        <input className={inputClass} value={f.partnerText} onChange={(e) => setF({ ...f, partnerText: e.target.value })} />
      </Labeled>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">Partner types</p>
        <Checks options={meta.partnerTypes} value={f.partnerTypeIds} onChange={(v) => setF({ ...f, partnerTypeIds: v })} none="All partner types" />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">Product categories</p>
        <Checks options={meta.categories} value={f.categoryIds} onChange={(v) => setF({ ...f, categoryIds: v })} none="All categories" />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Labeled label="Cities (comma-separated; empty = all)" className="sm:col-span-2">
          <input className={inputClass} value={f.cities} onChange={(e) => setF({ ...f, cities: e.target.value })} placeholder="New Delhi, Gurugram" />
        </Labeled>
        <Labeled label="From (optional)">
          <input type="date" className={inputClass} value={f.activeFrom} onChange={(e) => setF({ ...f, activeFrom: e.target.value })} />
        </Labeled>
        <Labeled label="To (optional)">
          <input type="date" className={inputClass} value={f.activeTo} onChange={(e) => setF({ ...f, activeTo: e.target.value })} />
        </Labeled>
        <Labeled label="Priority (higher wins)">
          <input className={inputClass} inputMode="numeric" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} />
        </Labeled>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || f.name.trim().length < 2 || f.customerText.trim().length < 5}>
          {busy ? 'Saving…' : 'Save benefit'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function BenefitsPage() {
  const { state } = useAuth();
  const canEdit = state.status === 'ready' && state.admin.role === 'admin';
  const [items, setItems] = useState<Benefit[] | null>(null);
  const [meta, setMeta] = useState<PlanList | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, m] = await Promise.all([api('/v1/admin/benefits', benefitListSchema), api('/v1/admin/commission-plans', planListSchema)]);
      setItems(b.items);
      setMeta(m);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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

  const names = (ids: string[], list: { id: string; name: string }[] | undefined) =>
    ids.map((id) => list?.find((x) => x.id === id)?.name ?? '?').join(', ');

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Referral benefits" />
      <div className="mt-6">
        <SettingsTabs />
      </div>
      <p className="max-w-3xl text-muted">
        What a referred customer gets. The best matching active benefit (highest priority) is saved on each lead when it's added and
        shown to the partner. In the MVP your team applies it by hand.
      </p>
      <div className="mt-6 space-y-3">
        {!canEdit && state.status === 'ready' ? <Alert tone="info">Only admins can change benefits.</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
      </div>

      {canEdit && meta ? (
        editing === 'new' ? (
          <div className="mt-6">
            <BenefitForm
              initial={empty}
              meta={meta}
              onCancel={() => setEditing(null)}
              onSave={(b) =>
                run(async () => {
                  await apiSend('/v1/admin/benefits', { method: 'POST', json: b });
                  setEditing(null);
                })
              }
            />
          </div>
        ) : (
          <Button className="mt-6" variant="outline" onClick={() => setEditing('new')}>
            + New benefit
          </Button>
        )
      ) : null}

      <div className="mt-6 space-y-4">
        {!items && !error ? <Spinner /> : null}
        {items?.length === 0 ? <Card className="p-6 text-sm text-muted">No benefits yet. Leads are added without one.</Card> : null}
        {items?.map((b) =>
          editing === b.id && meta ? (
            <BenefitForm
              key={b.id}
              initial={toForm(b)}
              meta={meta}
              onCancel={() => setEditing(null)}
              onSave={(body) =>
                run(async () => {
                  await apiSend(`/v1/admin/benefits/${b.id}`, { method: 'PATCH', json: body });
                  setEditing(null);
                })
              }
            />
          ) : (
            <Card key={b.id} className={cx('p-5', !b.active && 'opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-espresso">{b.name}</h2>
                    <Pill tone={b.active ? 'good' : 'neutral'}>{b.active ? 'Active' : 'Off'}</Pill>
                    <Pill>{BENEFIT_TYPE_LABELS[b.type]}</Pill>
                  </div>
                  <p className="mt-1 text-sm text-ink">"{b.customerText}"</p>
                  <p className="mt-1 text-xs text-muted">
                    {b.partnerTypeIds.length ? names(b.partnerTypeIds, meta?.partnerTypes) : 'All partner types'} ·{' '}
                    {b.cities.length ? b.cities.join(', ') : 'all cities'} ·{' '}
                    {b.categoryIds.length ? names(b.categoryIds, meta?.categories) : 'all categories'}
                    {b.activeFrom || b.activeTo ? ` · ${b.activeFrom ? formatDate(b.activeFrom) : '…'} to ${b.activeTo ? formatDate(b.activeTo) : '…'}` : ''}
                    {b.priority ? ` · priority ${b.priority}` : ''}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(b.id)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => run(() => apiSend(`/v1/admin/benefits/${b.id}`, { method: 'PATCH', json: { active: !b.active } }))}>
                      {b.active ? 'Turn off' : 'Turn on'}
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
