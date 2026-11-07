'use client';

import {
  ADMIN_LEAD_VIEW_KEYS,
  adminLeadListSchema,
  bulkJobSchema,
  CONSULTATION_MODE_LABELS,
  type AdminLeadList,
  type AdminLeadView,
  type BulkJob,
} from '@hoc/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { emptyStageForm, StageFields, stageFormReady, StagePill, type StageForm } from '@/components/lead-ui';
import { Alert, Button, Card, cx, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { CUSTOMER_TYPE_LABELS, formatDateTime, formatPhone, localToIso, timeAgo } from '@/lib/format';

const TABS: { view: AdminLeadView; label: string }[] = [
  { view: 'verify', label: 'To verify' },
  { view: 'open', label: 'Open' },
  { view: 'awaiting', label: 'Awaiting consent' },
  { view: 'purchased', label: 'Purchased' },
  { view: 'closed', label: 'Closed' },
  { view: 'all', label: 'All' },
];

function LeadsList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const v = params.get('view');
  const view: AdminLeadView = (ADMIN_LEAD_VIEW_KEYS as readonly string[]).includes(v ?? '') ? (v as AdminLeadView) : 'verify';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const [search, setSearch] = useState(q);
  const [data, setData] = useState<AdminLeadList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<StageForm>(emptyStageForm);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<BulkJob | null>(null);

  function navigate(next: { view?: AdminLeadView; q?: string; page?: number }) {
    const sp = new URLSearchParams();
    const nv = next.view ?? view;
    if (nv !== 'verify') sp.set('view', nv);
    const nq = next.q ?? q;
    if (nq) sp.set('q', nq);
    if ((next.page ?? 1) > 1) sp.set('page', String(next.page));
    setSelected(new Set());
    router.replace(`${pathname}${sp.size ? `?${sp}` : ''}`);
  }

  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => navigate({ q: search.trim(), page: 1 }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ view, page: String(page) });
    if (q) sp.set('q', q);
    setLoading(true);
    try {
      setData(await api(`/v1/admin/leads?${sp}`, adminLeadListSchema));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [view, page, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applyBulk() {
    setApplying(true);
    setError(null);
    try {
      const job = await api('/v1/admin/leads/bulk-stage', bulkJobSchema, {
        method: 'POST',
        json: {
          leadIds: [...selected],
          stage: bulk.stage,
          consultationMode: bulk.consultationMode || null,
          consultationAt: localToIso(bulk.consultationAt),
          note: bulk.note || undefined,
        },
      });
      setResult(job);
      setSelected(new Set());
      setBulk(emptyStageForm);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setApplying(false);
    }
  }

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((l) => selected.has(l.id));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader eyebrow="Leads" title={view === 'verify' ? 'Verification queue' : 'Leads'}>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone, L-000123, partner"
            aria-label="Search leads"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-72"
          />
          <Link href="/leads/bulk">
            <Button variant="outline">Update from CSV</Button>
          </Link>
        </div>
      </PageHeader>
      {view === 'verify' ? (
        <p className="mt-2 max-w-2xl text-muted">
          Customers who confirmed by OTP, oldest first. Look each number up in DigiCuro, then tag the customer type.
        </p>
      ) : null}

      <nav className="mt-8 flex gap-1 overflow-x-auto border-b border-line" aria-label="Filter leads">
        {TABS.map((t) => {
          const count = data?.counts[t.view] ?? 0;
          const active = t.view === view;
          return (
            <button
              key={t.view}
              type="button"
              onClick={() => navigate({ view: t.view, page: 1 })}
              aria-current={active ? 'page' : undefined}
              className={cx(
                '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium',
                active ? 'border-primary text-primary-deep' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t.label}
              {data ? (
                <span
                  className={cx(
                    'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    t.view === 'verify' && count > 0 ? 'bg-brass text-white' : 'bg-line/60 text-muted',
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {result ? (
          <Alert tone="info">
            Updated {result.appliedRows} of {result.totalRows} leads.
            {result.rows.some((r) => r.outcome !== 'applied') ? (
              <ul className="mt-1 text-xs">
                {result.rows
                  .filter((r) => r.outcome !== 'applied')
                  .map((r) => (
                    <li key={r.row}>
                      {r.ref ?? 'Lead'}: {r.reason}
                    </li>
                  ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}

        {selected.size > 0 ? (
          <Card className="sticky top-2 z-10 border-primary/40 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">
                {selected.size} lead{selected.size === 1 ? '' : 's'} selected
              </p>
              <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <StageFields value={bulk} onChange={setBulk} compact />
              <Button disabled={!stageFormReady(bulk) || applying} onClick={applyBulk}>
                {applying ? 'Updating…' : `Update ${selected.size}`}
              </Button>
            </div>
          </Card>
        ) : null}

        {!data && loading ? <Spinner /> : null}
        {data && items.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="font-display text-2xl text-espresso">
              {q ? 'No matches' : view === 'verify' ? 'Nothing to verify' : 'No leads here'}
            </p>
            <p className="mt-2 text-sm text-muted">
              {q ? `Nothing matches "${q}".` : view === 'verify' ? 'Leads appear here as soon as customers confirm.' : ''}
            </p>
          </Card>
        ) : null}

        {items.length > 0 ? (
          <Card className={cx('overflow-hidden', loading && 'opacity-60')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((l) => l.id)))}
                      />
                    </th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Partner</th>
                    <th className="px-3 py-3">Stage</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">{view === 'verify' ? 'Waiting' : view === 'awaiting' ? 'Added' : 'Updated'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((l) => (
                    <tr key={l.id} className={cx('hover:bg-blush/40', selected.has(l.id) && 'bg-blush/50')}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${l.ref}`}
                          checked={selected.has(l.id)}
                          onChange={() => {
                            const next = new Set(selected);
                            if (next.has(l.id)) next.delete(l.id);
                            else next.add(l.id);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/leads/${l.id}`} className="block font-semibold text-ink hover:text-primary">
                          {l.customerName}
                        </Link>
                        <span className="text-xs text-muted tabular-nums">
                          {l.ref} · {formatPhone(l.customerPhone)}
                          {l.city ? ` · ${l.city}` : ''}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted">
                        <Link href={`/partners/${l.partner.id}`} className="hover:text-primary">
                          {l.partner.name}
                        </Link>
                        {l.partner.code ? <span className="block text-xs">{l.partner.code}</span> : null}
                      </td>
                      <td className="px-3 py-3">
                        <StagePill stage={l.stage} />
                        {l.stage === 'consultation_booked' && l.consultation ? (
                          <span className="mt-1 block text-xs text-muted">
                            {CONSULTATION_MODE_LABELS[l.consultation.mode]}
                            {l.consultation.at ? ` · ${formatDateTime(l.consultation.at)}` : ''}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {l.customerType ? (
                          <Pill tone={l.customerType === 'new' ? 'good' : l.customerType === 'invalid' ? 'bad' : 'wait'}>
                            {CUSTOMER_TYPE_LABELS[l.customerType]}
                          </Pill>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted">
                        {timeAgo(view === 'verify' ? l.consentConfirmedAt : view === 'awaiting' ? l.createdAt : l.stageChangedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 ? (
              <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
                <span>
                  Page {page} of {pages} · {data?.total} leads
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => navigate({ page: page - 1 })}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => navigate({ page: page + 1 })}>
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

export default function LeadsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LeadsList />
    </Suspense>
  );
}
