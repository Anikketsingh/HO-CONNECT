'use client';

import { batchDetailSchema, formatINR, type BatchDetail } from '@hoc/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { inputClass } from '@/components/settings-tabs';
import { Alert, Button, Card, Pill, Spinner, TextArea } from '@/components/ui';
import { api, apiDownload, apiSend, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, PAYOUT_BATCH_LABELS, PAYOUT_STATUS_LABELS } from '@/lib/format';

type Row = BatchDetail['payouts'][number];

function PayoutActions({ batchId, row, run }: { batchId: string; row: Row; run: (fn: () => Promise<void>, done: string) => Promise<void> }) {
  const [utr, setUtr] = useState('');
  const [failing, setFailing] = useState(false);
  const [reason, setReason] = useState('');
  if (row.status === 'paid') {
    return (
      <span className="text-sm text-muted">
        UTR <span className="font-mono text-ink">{row.utr}</span>
        <span className="block text-xs">{formatDateTime(row.paidAt)}</span>
      </span>
    );
  }
  if (row.status !== 'pending') return <span className="text-xs text-muted">{row.failureReason}</span>;
  if (failing) {
    return (
      <div className="w-64 space-y-2">
        <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What went wrong? (kept in the history)" />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="danger"
            disabled={reason.trim().length < 5}
            onClick={() => run(() => apiSend(`/v1/admin/payout-batches/${batchId}/payouts/${row.id}/failed`, { method: 'POST', json: { reason: reason.trim() } }), 'Marked as failed. The commissions are back in "approved".')}
          >
            Mark failed
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFailing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input aria-label={`UTR for ${row.partner.name}`} className={`${inputClass} h-9 w-44`} value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="Bank reference (UTR)" />
      <Button size="sm" variant="success" disabled={utr.trim().length < 4} onClick={() => run(() => apiSend(`/v1/admin/payout-batches/${batchId}/payouts/${row.id}/paid`, { method: 'POST', json: { utr: utr.trim() } }), `Recorded. ${row.partner.name} has been told.`)}>
        Mark paid
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setFailing(true)}>
        Failed
      </Button>
    </div>
  );
}

export default function BatchPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useAuth();
  const isAdmin = state.status === 'ready' && state.admin.role === 'admin';
  const [b, setB] = useState<BatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setB(await api(`/v1/admin/payout-batches/${id}`, batchDetailSchema));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function run(fn: () => Promise<void>, done: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      await load();
    }
  }

  if (state.status === 'ready' && !isAdmin) return <Alert tone="info">Only admins can manage payouts.</Alert>;
  if (!b) return error ? <Alert>{error}</Alert> : <Spinner />;

  const open = b.status === 'draft' || b.status === 'exported';
  const sum = (k: 'grossPaise' | 'clawbackPaise' | 'tdsPaise') => b.payouts.filter((p) => p.status === 'pending' || p.status === 'paid').reduce((t, p) => t + p[k], 0);

  return (
    <div>
      <Link href="/payouts" className="text-sm font-medium text-primary hover:text-primary-deep">
        ← Payouts
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl text-espresso">{b.label}</h1>
        <Pill tone={b.status === 'completed' ? 'good' : b.status === 'cancelled' ? 'bad' : 'wait'}>{PAYOUT_BATCH_LABELS[b.status]}</Pill>
      </div>
      <p className="mt-1 text-sm text-muted">
        Created {formatDate(b.createdAt)} · {b.paidCount} of {b.payoutCount} paid · net {formatINR(b.netPaise)}
        {b.exportedAt ? ` · CSV downloaded ${formatDate(b.exportedAt)}` : ''}
      </p>
      <div className="mt-6 space-y-3">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}
      </div>

      {open ? (
        <Card className="mt-6 p-5">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
            <li>Download the CSV and send it to finance. It has bank or UPI details and PAN, so keep it safe.</li>
            <li>After the money is sent, enter each bank reference (UTR) below. Partners are told and see it in the app.</li>
            <li>If a payment fails, mark it failed: the commissions return to "approved" for the next batch.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => run(() => apiDownload(`/v1/admin/payout-batches/${b.id}/csv`, 'ho-connect-payouts.csv'), 'CSV downloaded. This download is recorded in the audit log.')}>Download CSV for finance</Button>
            {!cancelling ? (
              <Button variant="danger" onClick={() => setCancelling(true)}>
                Cancel batch
              </Button>
            ) : null}
          </div>
          {cancelling ? (
            <div className="mt-3 max-w-md space-y-2">
              <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this batch cancelled?" />
              <div className="flex gap-2">
                <Button variant="danger" disabled={reason.trim().length < 5} onClick={() => run(() => apiSend(`/v1/admin/payout-batches/${b.id}/cancel`, { method: 'POST', json: { reason: reason.trim() } }), 'Batch cancelled. Commissions are back in "approved".')}>
                  Confirm cancel
                </Button>
                <Button variant="ghost" onClick={() => setCancelling(false)}>
                  Keep batch
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line bg-paper text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Partner</th>
                <th className="px-3 py-3 text-right">Commissions</th>
                <th className="px-3 py-3 text-right">Reversals</th>
                <th className="px-3 py-3 text-right">TDS</th>
                <th className="px-3 py-3 text-right">Net</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {b.payouts.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <Link href={`/partners/${p.partner.id}`} className="font-semibold text-ink hover:text-primary">
                      {p.partner.name}
                    </Link>
                    <span className="block text-xs text-muted">
                      {p.partner.code} · {p.payoutDisplay}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatINR(p.grossPaise)}
                    <span className="block text-xs text-muted">{p.commissionCount} sale{p.commissionCount === 1 ? '' : 's'}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted">{p.clawbackPaise ? `− ${formatINR(p.clawbackPaise)}` : '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted">{p.tdsPaise ? `− ${formatINR(p.tdsPaise)}` : '—'}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatINR(p.netPaise)}</td>
                  <td className="px-3 py-3">
                    <Pill tone={p.status === 'paid' ? 'good' : p.status === 'pending' ? 'wait' : 'bad'}>{PAYOUT_STATUS_LABELS[p.status]}</Pill>
                  </td>
                  <td className="px-3 py-3">{open || p.status !== 'pending' ? <PayoutActions batchId={b.id} row={p} run={run} /> : null}</td>
                </tr>
              ))}
              <tr className="bg-paper">
                <td className="px-4 py-3 text-right text-muted">Totals (excluding failed or cancelled)</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatINR(sum('grossPaise'))}</td>
                <td className="px-3 py-3 text-right tabular-nums text-muted">{formatINR(sum('clawbackPaise'))}</td>
                <td className="px-3 py-3 text-right tabular-nums text-muted">{formatINR(sum('tdsPaise'))}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatINR(b.netPaise)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
