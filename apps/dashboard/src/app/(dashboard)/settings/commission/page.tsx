'use client';

import { planListSchema, type PlanList } from '@hoc/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { inputClass, Labeled, SettingsTabs } from '@/components/settings-tabs';
import { Alert, Button, Card, cx, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, apiSend, errorMessage } from '@/lib/api';
import { formatDate, paiseToInput, rupeesToPaiseInput, todayIST } from '@/lib/format';

type Plan = PlanList['plans'][number];
type Rule = Plan['rules'][number];

interface RuleForm {
  categoryId: string;
  customerType: string;
  rateType: 'percent' | 'flat';
  value: string;
  min: string;
  max: string;
  priority: string;
}

const emptyRule: RuleForm = { categoryId: '', customerType: '', rateType: 'percent', value: '', min: '', max: '', priority: '0' };

const toForm = (r: Rule): RuleForm => ({
  categoryId: r.categoryId ?? '',
  customerType: r.customerType ?? '',
  rateType: r.rateType,
  value: r.rateType === 'percent' ? String(r.rateValue / 100) : paiseToInput(r.rateValue),
  min: paiseToInput(r.minPaise),
  max: paiseToInput(r.maxPaise),
  priority: String(r.priority),
});

function toBody(f: RuleForm) {
  const value = Number(f.value);
  return {
    categoryId: f.categoryId || null,
    customerType: f.customerType || null,
    rateType: f.rateType,
    rateValue: f.rateType === 'percent' ? Math.round(value * 100) : (rupeesToPaiseInput(f.value) ?? 0),
    minPaise: rupeesToPaiseInput(f.min),
    maxPaise: rupeesToPaiseInput(f.max),
    priority: Number(f.priority) || 0,
  };
}

function RuleEditor({
  initial,
  categories,
  onSave,
  onCancel,
}: {
  initial: RuleForm;
  categories: PlanList['categories'];
  onSave: (body: ReturnType<typeof toBody>) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const valid = f.value.trim() !== '' && Number.isFinite(Number(f.value)) && Number(f.value) >= 0;

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
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-line bg-paper p-4 sm:grid-cols-4">
      <Labeled label="Product category">
        <select className={inputClass} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
          <option value="">Any product</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="Customer type">
        <select className={inputClass} value={f.customerType} onChange={(e) => setF({ ...f, customerType: e.target.value })}>
          <option value="">Any customer</option>
          <option value="new">New</option>
          <option value="existing_contact">Existing contact</option>
          <option value="existing_customer">Existing customer</option>
        </select>
      </Labeled>
      <Labeled label="Rate">
        <div className="flex gap-2">
          <select className={cx(inputClass, 'w-24')} value={f.rateType} onChange={(e) => setF({ ...f, rateType: e.target.value as 'percent' | 'flat' })}>
            <option value="percent">%</option>
            <option value="flat">₹ flat</option>
          </select>
          <input className={inputClass} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={f.rateType === 'percent' ? '7.5' : '500'} />
        </div>
      </Labeled>
      <Labeled label="Priority (higher wins a tie)">
        <input className={inputClass} inputMode="numeric" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} />
      </Labeled>
      <Labeled label="Minimum ₹ (optional)">
        <input className={inputClass} inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
      </Labeled>
      <Labeled label="Maximum ₹ (optional)">
        <input className={inputClass} inputMode="decimal" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />
      </Labeled>
      <div className="flex items-end gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy || !valid}>
          {busy ? 'Saving…' : 'Save rule'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PlanCard({ plan, data, canEdit, run }: { plan: Plan; data: PlanList; canEdit: boolean; run: (fn: () => Promise<void>) => Promise<void> }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [assignType, setAssignType] = useState('');
  const isDefault = plan.assignedTo.some((a) => a.scope === 'default');

  return (
    <Card className={cx('p-5', !plan.active && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl text-espresso">{plan.name}</h2>
            {!plan.active ? <Pill tone="bad">Inactive</Pill> : null}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            From {formatDate(plan.effectiveFrom)}
            {plan.effectiveTo ? ` to ${formatDate(plan.effectiveTo)}` : ', no end date'}
            {plan.description ? ` · ${plan.description}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {plan.assignedTo.length ? (
              plan.assignedTo.map((a) => (
                <span key={`${a.scope}-${a.scopeId}`} className="inline-flex items-center gap-1 rounded-full bg-blush px-2.5 py-0.5 text-xs font-medium text-primary-deep">
                  {a.label}
                  {canEdit && a.scope !== 'default' ? (
                    <button
                      type="button"
                      aria-label={`Remove from ${a.label}`}
                      className="ml-0.5 text-muted hover:text-danger"
                      onClick={() => run(() => apiSend('/v1/admin/plan-assignments', { method: 'PUT', json: { scope: a.scope, scopeId: a.scopeId, planId: null } }))}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted">Not assigned to anyone</span>
            )}
          </div>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {!isDefault ? (
              <Button size="sm" variant="outline" onClick={() => run(() => apiSend('/v1/admin/plan-assignments', { method: 'PUT', json: { scope: 'default', scopeId: null, planId: plan.id } }))}>
                Make default
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => run(() => apiSend(`/v1/admin/commission-plans/${plan.id}`, { method: 'PATCH', json: { active: !plan.active } }))}>
              {plan.active ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        ) : null}
      </div>

      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Labeled label="Use for a partner type">
            <select className={cx(inputClass, 'w-56')} value={assignType} onChange={(e) => setAssignType(e.target.value)}>
              <option value="">Choose…</option>
              {data.partnerTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Labeled>
          <Button
            size="sm"
            variant="outline"
            disabled={!assignType}
            onClick={() =>
              run(async () => {
                await apiSend('/v1/admin/plan-assignments', { method: 'PUT', json: { scope: 'partner_type', scopeId: assignType, planId: plan.id } });
                setAssignType('');
              })
            }
          >
            Assign
          </Button>
          <span className="pb-2 text-xs text-muted">Plans for a single partner are set on the partner's page.</span>
        </div>
      ) : null}

      <h3 className="mt-5 text-sm font-semibold text-ink">Rules</h3>
      <p className="text-xs text-muted">For each sale line the most specific rule wins: category and customer type, then category, then customer type, then "any".</p>
      <ul className="mt-2 divide-y divide-line">
        {plan.rules.map((r) =>
          editing === r.id ? (
            <li key={r.id} className="py-3">
              <RuleEditor
                initial={toForm(r)}
                categories={data.categories}
                onCancel={() => setEditing(null)}
                onSave={(body) =>
                  run(async () => {
                    await apiSend(`/v1/admin/commission-plans/${plan.id}/rules/${r.id}`, { method: 'PUT', json: body });
                    setEditing(null);
                  })
                }
              />
            </li>
          ) : (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-sm text-ink">{r.description}</span>
              <span className="flex items-center gap-2">
                {r.priority ? <span className="text-xs text-muted">priority {r.priority}</span> : null}
                {canEdit ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r.id)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm('Delete this rule? Commissions already calculated keep their rates.')) {
                          void run(() => apiSend(`/v1/admin/commission-plans/${plan.id}/rules/${r.id}`, { method: 'DELETE' }));
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </>
                ) : null}
              </span>
            </li>
          ),
        )}
        {plan.rules.length === 0 ? <li className="py-2.5 text-sm text-muted">No rules: every sale on this plan earns ₹0.</li> : null}
      </ul>
      {canEdit ? (
        editing === 'new' ? (
          <div className="mt-3">
            <RuleEditor
              initial={emptyRule}
              categories={data.categories}
              onCancel={() => setEditing(null)}
              onSave={(body) =>
                run(async () => {
                  await apiSend(`/v1/admin/commission-plans/${plan.id}/rules`, { method: 'POST', json: body });
                  setEditing(null);
                })
              }
            />
          </div>
        ) : (
          <Button className="mt-2" size="sm" variant="outline" onClick={() => setEditing('new')}>
            + Add a rule
          </Button>
        )
      ) : null}
    </Card>
  );
}

export default function CommissionSettingsPage() {
  const { state } = useAuth();
  const canEdit = state.status === 'ready' && state.admin.role === 'admin';
  const [data, setData] = useState<PlanList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState({ name: '', effectiveFrom: todayIST(), effectiveTo: '' });

  const load = useCallback(async () => {
    try {
      setData(await api('/v1/admin/commission-plans', planListSchema));
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

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Commission plans" />
      <div className="mt-6">
        <SettingsTabs />
      </div>
      <p className="max-w-3xl text-muted">
        The most specific plan applies: a partner's own plan, then their partner type's, then the default. Rates are worked out on
        each sale line's net value (excluding GST and the trial fee) and frozen on the commission when the sale is recorded, so
        later changes never alter past commissions.
      </p>
      <div className="mt-6 space-y-3">
        {!canEdit && state.status === 'ready' ? <Alert tone="info">Only admins can change commission plans.</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
      </div>

      {canEdit ? (
        <Card className="mt-6 p-5">
          <h2 className="font-semibold text-espresso">New plan</h2>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await apiSend('/v1/admin/commission-plans', {
                  method: 'POST',
                  json: { name: newPlan.name.trim(), effectiveFrom: newPlan.effectiveFrom, effectiveTo: newPlan.effectiveTo || null },
                });
                setNewPlan({ name: '', effectiveFrom: todayIST(), effectiveTo: '' });
              });
            }}
          >
            <Labeled label="Name">
              <input className={inputClass} value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} placeholder="e.g. Pilot – Delhi NCR" />
            </Labeled>
            <Labeled label="Starts">
              <input type="date" className={inputClass} value={newPlan.effectiveFrom} onChange={(e) => setNewPlan({ ...newPlan, effectiveFrom: e.target.value })} />
            </Labeled>
            <Labeled label="Ends (optional)">
              <input type="date" className={inputClass} value={newPlan.effectiveTo} onChange={(e) => setNewPlan({ ...newPlan, effectiveTo: e.target.value })} />
            </Labeled>
            <Button type="submit" disabled={newPlan.name.trim().length < 2}>
              Create
            </Button>
          </form>
        </Card>
      ) : null}

      <div className="mt-6 space-y-6">
        {!data && !error ? <Spinner /> : null}
        {data?.plans.map((p) => <PlanCard key={p.id} plan={p} data={data} canEdit={canEdit} run={run} />)}
      </div>
    </div>
  );
}
