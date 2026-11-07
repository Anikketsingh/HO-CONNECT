'use client';

import { adminPartnerListSchema, PARTNER_STATUSES, type AdminPartnerList, type PartnerStatus } from '@hoc/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Alert, Button, Card, cx, PageHeader, Spinner, StatusPill } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatPhone, timeAgo } from '@/lib/format';

const TABS: { status: PartnerStatus | 'all'; label: string }[] = [
  { status: 'submitted', label: 'Awaiting review' },
  { status: 'changes_requested', label: 'Changes requested' },
  { status: 'approved', label: 'Approved' },
  { status: 'draft', label: 'In progress' },
  { status: 'rejected', label: 'Rejected' },
  { status: 'suspended', label: 'Suspended' },
  { status: 'all', label: 'All' },
];

function PartnersList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const statusParam = params.get('status');
  const status: PartnerStatus | 'all' =
    statusParam === 'all' || (PARTNER_STATUSES as readonly string[]).includes(statusParam ?? '')
      ? (statusParam as PartnerStatus | 'all')
      : 'submitted';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const q = params.get('q') ?? '';

  const [search, setSearch] = useState(q);
  const [data, setData] = useState<AdminPartnerList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function navigate(next: { status?: string; page?: number; q?: string }) {
    const sp = new URLSearchParams();
    const s = next.status ?? status;
    const query = next.q ?? q;
    if (s !== 'submitted') sp.set('status', s);
    if (query) sp.set('q', query);
    if ((next.page ?? 1) > 1) sp.set('page', String(next.page));
    router.replace(`${pathname}${sp.size ? `?${sp}` : ''}`);
  }

  // Debounced search box → URL
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => navigate({ q: search.trim(), page: 1 }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    const sp = new URLSearchParams({ page: String(page) });
    if (status !== 'all') sp.set('status', status);
    if (q) sp.set('q', q);
    let cancelled = false;
    setLoading(true);
    api(`/v1/admin/partners?${sp}`, adminPartnerListSchema)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: unknown) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, page, q]);

  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader eyebrow="Partners" title="Applications">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, city, phone or code"
          aria-label="Search partners"
          className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-80"
        />
      </PageHeader>

      <nav className="mt-8 flex gap-1 overflow-x-auto border-b border-line" aria-label="Filter by status">
        {TABS.map((tab) => {
          const count = tab.status === 'all' ? total : (data?.counts[tab.status] ?? 0);
          const active = tab.status === status;
          return (
            <button
              key={tab.status}
              type="button"
              onClick={() => navigate({ status: tab.status, page: 1 })}
              aria-current={active ? 'page' : undefined}
              className={cx(
                '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium',
                active ? 'border-primary text-primary-deep' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {tab.label}
              {data ? (
                <span
                  className={cx(
                    'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    tab.status === 'submitted' && count > 0 ? 'bg-brass text-white' : 'bg-line/60 text-muted',
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-6">
        {error ? <Alert>{error}</Alert> : null}
        {!data && loading ? <Spinner /> : null}
        {data && data.items.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="font-display text-2xl text-espresso">
              {q ? 'No matches' : status === 'submitted' ? 'Nothing waiting for review' : 'No partners here yet'}
            </p>
            <p className="mt-2 text-sm text-muted">
              {q
                ? `Nothing matches "${q}".`
                : status === 'submitted'
                  ? 'Applications appear here when partners submit them from the app.'
                  : 'Partners move here as their applications progress.'}
            </p>
          </Card>
        ) : null}

        {data && data.items.length > 0 ? (
          <Card className={cx('overflow-hidden', loading && 'opacity-60')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">Partner</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">{status === 'submitted' ? 'Waiting since' : 'Updated'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((p) => (
                    <tr key={p.id} className="hover:bg-blush/40">
                      <td className="px-4 py-3">
                        <Link href={`/partners/${p.id}`} className="block font-semibold text-ink hover:text-primary">
                          {p.businessName ?? 'Unnamed'}
                        </Link>
                        <span className="text-xs text-muted">
                          {p.ownerName}
                          {p.code ? ` · ${p.code}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{p.partnerType}</td>
                      <td className="px-4 py-3 text-muted">{p.city ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted tabular-nums">{formatPhone(p.phone)}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={p.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {timeAgo(status === 'submitted' ? p.submittedAt : p.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 ? (
              <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
                <span>
                  Page {page} of {pages} · {data.total} partners
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

export default function PartnersPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PartnersList />
    </Suspense>
  );
}
