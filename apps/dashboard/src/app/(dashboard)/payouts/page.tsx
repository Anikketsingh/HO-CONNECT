'use client';

import { batchInputSchema, batchListSchema, createdIdSchema, formatINR, payoutPlanSchema, type BatchSummary, type PayoutPlan } from '@hoc/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { inputClass, Labeled } from '@/components/settings-tabs';
import { Alert, Button, Card, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { currentMonthLabel, formatDate, PAYOUT_BATCH_LABELS } from '@/lib/format';

export default function PayoutsPage() {
  const { state } = useAuth();
  const router = useRouter();
  const isAdmin = state.status === 'ready' && state.admin.role === 'admin';
  const [plan, setPlan] = useState<PayoutPlan | null>(null);
  const [batches, setBatches] = useState<BatchSummary[] | null>(null);
  const [label, setLabel] = useState(currentMonthLabel());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, b] = await Promise.all([api('/v1/admin/payouts/preview', payoutPlanSchema), api('/v1/admin/payout-batches', batchListSchema)]);
      setPlan(p);
      setBatches(b.items);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const body = batchInputSchema.parse({ label });
      const { id } = await api('/v1/admin/payout-batches', createdIdSchema, { method: 'POST', json: body });
      router.push(`/payouts/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  if (state.status === 'ready' && !isAdmin) {
    return (
      <div>
        <PageHeader eyebrow="Money" title="Payouts" />
        <div className="mt-6">
          <Alert tone="info">Only admins can manage payouts.</Alert>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Money" title="Payouts" />
      <p className="mt-2 max-w-3xl text-muted">
        Approved commissions are paid in batches. Build a batch, send the CSV to finance, then record each payment's bank
        reference (UTR) here so partners see it in the app.
      </p>
      <div className="mt-6 space-y-3">{error ? <Alert>{error}</Alert> : null}</div>

      <Card className="mt-6 p-5">
        <h2 className="font-semibold text-espresso">Ready to pay</h2>
        {!plan ? (
          <div className="mt-3">{error ? null : <Spinner />}</div>
        ) : plan.items.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nobody is ready to be paid. Approved commissions of at least {formatINR(plan.minPayoutPaise)} appear here.</p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="py-2">Partner</th>
                    <th className="py-2 text-right">Commissions</th>
                    <th className="py-2 text-right">Reversals</th>
                    <th className="py-2 text-right">TDS</th>
                    <th className="py-2 text-right">Net payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {plan.items.map((i) => (
                    <tr key={i.partnerId}>
                      <td className="py-2">
                        <span className="font-medium text-ink">{i.name}</span>
                        <span className="block text-xs text-muted">
                          {i.code} · {i.payoutDisplay}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatINR(i.grossPaise)}
                        <span className="block text-xs text-muted">{i.commissionCount} sale{i.commissionCount === 1 ? '' : 's'}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted">{i.clawbackPaise ? `− ${formatINR(i.clawbackPaise)}` : '—'}</td>
                      <td className="py-2 text-right tabular-nums text-muted">{i.tdsPaise ? `− ${formatINR(i.tdsPaise)}` : '—'}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{formatINR(i.netPaise)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} className="py-2 text-right text-muted">
                      Total to pay
                    </td>
                    <td className="py-2 text-right font-display text-xl text-espresso tabular-nums">{formatINR(plan.totals.netPaise)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              TDS is {plan.tdsBps / 100}% of commission after reversals.{' '}
              {plan.tdsBps === 0 ? <span className="text-danger">No TDS is being deducted: confirm the rate with finance, then set it in Settings → General.</span> : null}
            </p>
            {isAdmin ? (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <Labeled label="Batch name" className="w-64">
                  <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} />
                </Labeled>
                <Button disabled={busy || label.trim().length < 2} onClick={create}>
                  {busy ? 'Creating…' : `Create batch for ${plan.items.length} partner${plan.items.length === 1 ? '' : 's'}`}
                </Button>
              </div>
            ) : null}
          </>
        )}
        {plan?.skipped.length ? (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-sm font-semibold text-ink">Not in this batch</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {plan.skipped.map((s) => (
                <li key={s.partnerId}>
                  <span className="font-medium text-ink">{s.name}</span>
                  {s.waitingPaise ? ` (${formatINR(s.waitingPaise)} waiting)` : ''}: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <h2 className="mt-10 font-display text-2xl text-espresso">Batches</h2>
      <div className="mt-3">
        {!batches ? null : batches.length === 0 ? (
          <Card className="p-6 text-sm text-muted">No batches yet.</Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {batches.map((b) => (
                  <tr key={b.id} className="hover:bg-blush/40">
                    <td className="px-4 py-3">
                      <Link href={`/payouts/${b.id}`} className="font-semibold text-ink hover:text-primary">
                        {b.label}
                      </Link>
                      <span className="block text-xs text-muted">Created {formatDate(b.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={b.status === 'completed' ? 'good' : b.status === 'cancelled' ? 'bad' : 'wait'}>{PAYOUT_BATCH_LABELS[b.status]}</Pill>
                    </td>
                    <td className="px-4 py-3 text-muted tabular-nums">
                      {b.paidCount} of {b.payoutCount}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatINR(b.netPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
