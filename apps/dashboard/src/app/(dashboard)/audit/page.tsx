'use client';

import { auditListSchema, type AuditList } from '@hoc/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { inputClass, Labeled } from '@/components/settings-tabs';
import { Alert, Button, Card, cx, PageHeader, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

/** Where to open an audit entry. */
function link(entity: string, id: string): string | null {
  switch (entity) {
    case 'partner':
      return `/partners/${id}`;
    case 'lead':
      return `/leads/${id}`;
    case 'commission':
      return `/commissions/${id}`;
    case 'payout_batch':
      return `/payouts/${id}`;
    case 'qr_code':
      return `/qr-codes/${id}`;
    default:
      return null;
  }
}

export default function AuditPage() {
  const { state } = useAuth();
  const isAdmin = state.status === 'ready' && state.admin.role === 'admin';
  const [data, setData] = useState<AuditList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(page) });
    if (q.trim()) sp.set('q', q.trim());
    if (entity) sp.set('entity', entity);
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
    try {
      setData(await api(`/v1/admin/audit?${sp}`, auditListSchema));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [q, entity, from, to, page]);
  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load, isAdmin]);

  if (state.status === 'ready' && !isAdmin) {
    return (
      <div>
        <PageHeader eyebrow="Audit log" title="Who did what" />
        <div className="mt-6">
          <Alert tone="info">Only admins can see the audit log.</Alert>
        </div>
      </div>
    );
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader eyebrow="Audit log" title="Who did what" />
      <p className="mt-2 max-w-2xl text-muted">Every change made in the dashboard and by partners, newest first. Entries can't be edited or deleted.</p>
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <Labeled label="Search action, id or reason">
          <input className={cx(inputClass, 'w-64')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="e.g. approved, L-000012" />
        </Labeled>
        <Labeled label="About">
          <select className={cx(inputClass, 'w-44')} value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
            <option value="">Everything</option>
            {data?.entities.map((x) => (
              <option key={x} value={x}>
                {x.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="From">
          <input type="date" className={cx(inputClass, 'w-40')} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </Labeled>
        <Labeled label="To">
          <input type="date" className={cx(inputClass, 'w-40')} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </Labeled>
      </div>

      <div className="mt-6 space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {!data && !error ? <Spinner /> : null}
        {data && data.items.length === 0 ? <Card className="p-8 text-center text-sm text-muted">Nothing matches.</Card> : null}
        {data && data.items.length ? (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {data.items.map((i) => {
                const href = link(i.entity, i.entityId);
                const hasDetail = i.before !== null || i.after !== null;
                return (
                  <li key={i.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-ink">
                        <span className="font-medium">{i.actor}</span> · <span className="font-mono text-[13px]">{i.action}</span>
                      </p>
                      <span className="text-xs text-muted">{formatDateTime(i.at)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {i.entity.replace('_', ' ')}{' '}
                      {href ? (
                        <Link href={href} className="text-primary">
                          {i.entityId.slice(0, 8)}…
                        </Link>
                      ) : (
                        i.entityId.slice(0, 8)
                      )}
                    </p>
                    {i.reason ? <p className="mt-1 text-muted">{i.reason}</p> : null}
                    {hasDetail ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-primary">Details</summary>
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-paper p-3 text-xs text-ink">{JSON.stringify({ before: i.before, after: i.after }, null, 2)}</pre>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {pages > 1 ? (
              <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-muted">
                <span>
                  Page {page} of {pages} · {data.total} entries
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
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
