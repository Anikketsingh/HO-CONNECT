'use client';

import { approveResultSchema, COMMISSION_VIEWS, commissionListSchema, formatINR, type CommissionList, type CommissionView } from '@hoc/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Alert, Button, Card, cx, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { COMMISSION_STATUS_LABELS, FLAG_LABELS, formatDate } from '@/lib/format';

const TABS: { view: CommissionView; label: string }[] = [
  { view: 'approvable', label: 'Ready to approve' },
  { view: 'flagged', label: 'Flagged' },
  { view: 'pending', label: 'On hold' },
  { view: 'approved', label: 'Approved' },
  { view: 'closed', label: 'Rejected or reversed' },
  { view: 'all', label: 'All' },
];

function CommissionsList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { state } = useAuth();
  const isAdmin = state.status === 'ready' && state.admin.role === 'admin';
  const v = params.get('view');
  const view: CommissionView = (COMMISSION_VIEWS as readonly string[]).includes(v ?? '') ? (v as CommissionView) : 'approvable';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const [data, setData] = useState<CommissionList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/v1/admin/commissions?view=${view}&page=${page}`, commissionListSchema));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [view, page]);
  useEffect(() => {
    void load();
  }, [load]);

  const go = (next: { view?: CommissionView; page?: number }) => {
    const sp = new URLSearchParams();
    const nv = next.view ?? view;
    if (nv !== 'approvable') sp.set('view', nv);
    if ((next.page ?? 1) > 1) sp.set('page', String(next.page));
    setSelected(new Set());
    router.replace(`${pathname}${sp.size ? `?${sp}` : ''}`);
  };

  async function approveSelected() {
    const flagged = data?.items.filter((i) => selected.has(i.id) && i.flagged).length ?? 0;
    if (flagged && !window.confirm(`${flagged} of these are flagged. Have you reviewed them? Approve anyway?`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api('/v1/admin/commissions/approve', approveResultSchema, { method: 'POST', json: { ids: [...selected] } });
      setNotice(`Approved ${r.approved}${r.skipped ? `; ${r.skipped} skipped because they're no longer ready` : ''}.`);
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const items = data?.items ?? [];
  const selectable = view === 'approvable' && isAdmin;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader eyebrow="Money" title="Commissions">
        {data ? (
          <p className="text-right text-sm text-muted">
            {TABS.find((t) => t.view === view)?.label}: <span className="font-display text-2xl text-espresso">{formatINR(data.sumPaise)}</span>
          </p>
        ) : null}
      </PageHeader>
      <p className="mt-2 max-w-3xl text-muted">
        Commissions are created when a sale is recorded on a lead. Each waits out the hold period, then an admin approves it. Flagged
        ones (existing customer, sale linked by hand, adjusted) need a closer look.
      </p>

      <nav className="mt-8 flex gap-1 overflow-x-auto border-b border-line" aria-label="Filter commissions">
        {TABS.map((t) => (
          <button
            key={t.view}
            type="button"
            onClick={() => go({ view: t.view, page: 1 })}
            aria-current={t.view === view ? 'page' : undefined}
            className={cx(
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium',
              t.view === view ? 'border-primary text-primary-deep' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            {data ? (
              <span className={cx('rounded-full px-1.5 text-[11px] font-semibold tabular-nums', t.view === 'approvable' && data.counts.approvable ? 'bg-brass text-white' : 'bg-line/60 text-muted')}>
                {data.counts[t.view]}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="mt-6 space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        {selectable && selected.size ? (
          <Card className="flex items-center justify-between gap-3 border-primary/40 p-4">
            <span className="text-sm font-semibold text-ink">
              {selected.size} selected ·{' '}
              {formatINR(items.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.amountPaise, 0))}
            </span>
            <Button variant="success" disabled={busy} onClick={approveSelected}>
              {busy ? 'Approving…' : `Approve ${selected.size}`}
            </Button>
          </Card>
        ) : null}

        {!data ? <Spinner /> : null}
        {data && items.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted">
            {view === 'approvable' ? 'Nothing to approve right now.' : 'No commissions here.'}
          </Card>
        ) : null}
        {items.length ? (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {selectable ? (
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={items.every((i) => selected.has(i.id))}
                          onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
                        />
                      </th>
                    ) : null}
                    <th className="px-3 py-3">Lead</th>
                    <th className="px-3 py-3">Partner</th>
                    <th className="px-3 py-3">Sale</th>
                    <th className="px-3 py-3 text-right">Commission</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((c) => (
                    <tr key={c.id} className="hover:bg-blush/40">
                      {selectable ? (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${c.lead.ref}`}
                            checked={selected.has(c.id)}
                            onChange={() => {
                              const n = new Set(selected);
                              if (n.has(c.id)) n.delete(c.id);
                              else n.add(c.id);
                              setSelected(n);
                            }}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-3">
                        <Link href={`/commissions/${c.id}`} className="block font-semibold text-ink hover:text-primary">
                          {c.lead.customerName}
                        </Link>
                        <span className="text-xs text-muted">{c.lead.ref}</span>
                      </td>
                      <td className="px-3 py-3 text-muted">
                        {c.partner.name}
                        {c.partner.code ? <span className="block text-xs">{c.partner.code}</span> : null}
                      </td>
                      <td className="px-3 py-3 text-muted">
                        {formatDate(c.sale.saleDate)} · {formatINR(c.sale.totalNetPaise)}
                        {c.sale.invoiceNo ? <span className="block text-xs">{c.sale.invoiceNo}</span> : null}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-ink tabular-nums">
                        {formatINR(c.amountPaise)}
                        {c.adjustmentPaise ? <span className="block text-xs font-normal text-muted">calc. {formatINR(c.calculatedPaise)}</span> : null}
                      </td>
                      <td className="px-3 py-3">
                        <Pill tone={c.status === 'approvable' ? 'wait' : ['approved', 'in_payout', 'paid'].includes(c.status) ? 'good' : ['reversed', 'rejected'].includes(c.status) ? 'bad' : 'neutral'}>
                          {COMMISSION_STATUS_LABELS[c.status]}
                        </Pill>
                        {c.status === 'pending' ? <span className="mt-1 block text-xs text-muted">until {formatDate(c.holdUntil)}</span> : null}
                        {c.flags.length ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {c.flags.map((f) => (
                              <span key={f} className="rounded bg-brass-soft px-1.5 text-[11px] font-medium text-espresso">
                                {FLAG_LABELS[f] ?? f}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 ? (
              <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
                <span>
                  Page {page} of {pages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go({ page: page - 1 })}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go({ page: page + 1 })}>
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export default function CommissionsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CommissionsList />
    </Suspense>
  );
}
