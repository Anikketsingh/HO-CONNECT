'use client';

import { commissionDetailSchema, formatINR, type CommissionDetail } from '@hoc/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { inputClass, Labeled } from '@/components/settings-tabs';
import { Alert, Button, Card, Pill, Spinner, TextArea } from '@/components/ui';
import { api, apiSend, errorMessage } from '@/lib/api';
import { COMMISSION_STATUS_LABELS, CUSTOMER_TYPE_LABELS, FLAG_LABELS, formatDate, formatDateTime, rupeesToPaiseInput } from '@/lib/format';

const ACTION_LABELS: Record<string, string> = {
  'sale.recorded': 'Recorded the sale',
  'commission.approved': 'Approved',
  'commission.auto_approved': 'Approved automatically after the hold',
  'commission.adjusted': 'Adjusted the amount',
  'commission.rejected': 'Rejected',
  'commission.reversed': 'Reversed (sale returned)',
};

type Mode = 'adjust' | 'reject' | 'reverse' | null;

export default function CommissionPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useAuth();
  const isAdmin = state.status === 'ready' && state.admin.role === 'admin';
  const [c, setC] = useState<CommissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setC(await api(`/v1/admin/commissions/${id}`, commissionDetailSchema));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<void>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      setMode(null);
      setReason('');
      setAmount('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      await load();
    }
  }

  if (!c) return error ? <Alert>{error}</Alert> : <Spinner />;

  const open = ['pending', 'approvable', 'approved'].includes(c.status);
  const newTotal = rupeesToPaiseInput(amount);

  return (
    <div>
      <Link href="/commissions" className="text-sm font-medium text-primary hover:text-primary-deep">
        ← Commissions
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl text-espresso tabular-nums">{formatINR(c.amountPaise)}</h1>
        <Pill tone={c.status === 'approvable' ? 'wait' : ['approved', 'in_payout', 'paid'].includes(c.status) ? 'good' : ['reversed', 'rejected'].includes(c.status) ? 'bad' : 'neutral'}>
          {COMMISSION_STATUS_LABELS[c.status]}
        </Pill>
        {c.flags.map((f) => (
          <span key={f} className="rounded bg-brass-soft px-2 py-0.5 text-xs font-medium text-espresso">
            {FLAG_LABELS[f] ?? f}
          </span>
        ))}
      </div>
      <p className="mt-1 text-sm text-muted">
        <Link href={`/leads/${c.lead.id}`} className="text-primary">
          {c.lead.customerName} ({c.lead.ref})
        </Link>{' '}
        · referred by {c.partner.name} {c.partner.code ? `(${c.partner.code})` : ''}
        {c.status === 'pending' ? ` · on hold until ${formatDate(c.holdUntil)}` : ''}
      </p>

      <div className="mt-6 space-y-3">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        {c.statusReason ? <Alert tone="info">Reason: {c.statusReason}</Alert> : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold text-espresso">How it was calculated</h2>
            <p className="mt-1 text-sm text-muted">
              Plan "{c.snapshot.planName}" ({c.snapshot.assignedVia.replace('_', ' ')}) · customer:{' '}
              {CUSTOMER_TYPE_LABELS[c.snapshot.customerType] ?? c.snapshot.customerType}. Frozen when the sale was recorded.
            </p>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">Line</th>
                  <th className="py-2">Rule</th>
                  <th className="py-2 text-right">Net value</th>
                  <th className="py-2 text-right">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {c.snapshot.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2 text-ink">{l.categoryName}</td>
                    <td className="py-2 text-muted">{l.rule ?? 'No matching rule'}</td>
                    <td className="py-2 text-right tabular-nums">{formatINR(l.netPaise)}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{formatINR(l.amountPaise)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="py-2 text-right text-muted">
                    Calculated
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatINR(c.calculatedPaise)}</td>
                </tr>
                {c.adjustmentPaise ? (
                  <tr>
                    <td colSpan={3} className="py-2 text-right text-muted">
                      Adjustment{c.adjustmentReason ? `: ${c.adjustmentReason}` : ''}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatINR(c.adjustmentPaise)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-espresso">History</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {c.history.map((h, i) => (
                <li key={i}>
                  <p className="text-ink">
                    <span className="font-medium">{h.actor}</span> · {ACTION_LABELS[h.action] ?? h.action}
                  </p>
                  {h.reason ? <p className="text-muted">{h.reason}</p> : null}
                  <p className="text-xs text-muted">{formatDateTime(h.createdAt)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold text-espresso">Sale</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Date</dt>
                <dd>{formatDate(c.sale.saleDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Invoice</dt>
                <dd>{c.sale.invoiceNo ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Net value</dt>
                <dd className="tabular-nums">{formatINR(c.sale.totalNetPaise)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Approved</dt>
                <dd>{c.approvedBy ? `${c.approvedBy}, ${formatDateTime(c.approvedAt)}` : '—'}</dd>
              </div>
            </dl>
          </Card>

          {isAdmin && open ? (
            <Card className="p-5">
              <h2 className="font-semibold text-espresso">Actions</h2>
              {mode === null ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.status === 'approvable' ? (
                    <Button variant="success" disabled={busy} onClick={() => act(() => apiSend('/v1/admin/commissions/approve', { method: 'POST', json: { ids: [c.id] } }), 'Approved.')}>
                      Approve
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => setMode('adjust')}>
                    Adjust
                  </Button>
                  <Button variant="danger" onClick={() => setMode('reject')}>
                    Reject
                  </Button>
                  <Button variant="danger" onClick={() => setMode('reverse')}>
                    Sale returned
                  </Button>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {mode === 'adjust' ? (
                    <Labeled label="New amount (₹)">
                      <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(c.calculatedPaise / 100)} />
                    </Labeled>
                  ) : null}
                  <TextArea
                    label={mode === 'adjust' ? 'Why (kept in the history)' : mode === 'reject' ? 'Why it will not be paid' : 'What happened to the sale'}
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  {mode === 'adjust' && c.status === 'approved' ? <p className="text-xs text-muted">It will need approving again.</p> : null}
                  <div className="flex gap-2">
                    <Button
                      variant={mode === 'adjust' ? 'primary' : 'danger'}
                      disabled={busy || reason.trim().length < 5 || (mode === 'adjust' && (newTotal === null || newTotal < 0))}
                      onClick={() =>
                        act(
                          () =>
                            mode === 'adjust'
                              ? apiSend(`/v1/admin/commissions/${c.id}/adjust`, { method: 'POST', json: { adjustmentPaise: (newTotal ?? 0) - c.calculatedPaise, reason: reason.trim() } })
                              : apiSend(`/v1/admin/commissions/${c.id}/${mode}`, { method: 'POST', json: { reason: reason.trim() } }),
                          mode === 'adjust' ? 'Adjusted.' : mode === 'reject' ? 'Rejected.' : 'Reversed.',
                        )
                      }
                    >
                      Confirm
                    </Button>
                    <Button variant="ghost" onClick={() => setMode(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ) : null}
          {isAdmin && (c.status === 'in_payout' || c.status === 'paid') ? (
            <Card className="p-5">
              <Button variant="danger" onClick={() => setMode('reverse')}>
                Sale returned
              </Button>
              {mode === 'reverse' ? (
                <div className="mt-3 space-y-2">
                  <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened" />
                  <Button variant="danger" disabled={busy || reason.trim().length < 5} onClick={() => act(() => apiSend(`/v1/admin/commissions/${c.id}/reverse`, { method: 'POST', json: { reason: reason.trim() } }), 'Reversed. It will be netted against the next payout.')}>
                    Confirm reversal
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
