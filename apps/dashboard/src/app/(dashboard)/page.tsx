'use client';

import { adminOverviewSchema, type AdminOverview } from '@hoc/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Alert, Card, cx, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Stat({ label, value, note, highlight }: { label: string; value: number; note: string; highlight?: boolean }) {
  return (
    <Card className={cx('p-5', highlight && 'border-brass bg-brass-soft/25')}>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-4xl text-espresso tabular-nums">{value.toLocaleString('en-IN')}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </Card>
  );
}

export default function OverviewPage() {
  const { state } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api('/v1/admin/overview', adminOverviewSchema)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the overview.'));
  }, []);

  const name = state.status === 'ready' ? state.admin.name.split(' ')[0] : '';
  const role = state.status === 'ready' ? state.admin.role : null;

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Overview</p>
      <h1 className="mt-2 font-display text-4xl text-espresso">
        {greeting()}, {name}
      </h1>
      <p className="mt-2 text-muted">
        You're signed in as {role === 'admin' ? 'an admin' : 'an agent'}.
        {role === 'admin' ? ' You can change settings and approve commissions.' : ''}
      </p>

      <section className="mt-10" aria-label="Headline numbers">
        {error ? <Alert>{error}</Alert> : null}
        {!data && !error ? <Spinner /> : null}
        {data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/partners" className="rounded-2xl">
              <Stat
                label="Awaiting review"
                value={data.partners.awaitingReview}
                note={`${data.partners.total} partner applications in total`}
                highlight={data.partners.awaitingReview > 0}
              />
            </Link>
            <Link href="/leads" className="rounded-2xl">
              <Stat
                label="Leads to verify"
                value={data.leads.toVerify}
                note={`${data.partners.approved} approved partners`}
                highlight={data.leads.toVerify > 0}
              />
            </Link>
            <Stat label="Active leads" value={data.leads.active} note={`${data.leads.total} leads in total`} />
            <Stat label="First purchases" value={data.leads.purchased} note={`Across ${data.centres} experience centres`} />
          </div>
        ) : null}
      </section>

      {data ? (
        <Card className="mt-10 p-6">
          <h2 className="font-display text-2xl text-espresso">Needs attention</h2>
          {(() => {
            const items = [
              { n: data.partners.awaitingReview, text: 'partner applications to review', href: '/partners' },
              { n: data.leads.toVerify, text: 'leads waiting for verification', href: '/leads' },
              { n: data.commissions.toApprove, text: 'commissions ready to approve', href: '/commissions' },
              { n: data.partners.deletionRequests, text: 'account deletion requests', href: '/partners?status=all' },
            ].filter((i) => i.n > 0);
            return items.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nothing is waiting for you.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {items.map((i) => (
                  <li key={i.text}>
                    <Link href={i.href} className="flex items-center gap-4 py-3 text-sm hover:text-primary">
                      <span className="w-10 font-display text-2xl text-primary-deep tabular-nums">{i.n}</span>
                      <span className="text-ink">{i.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            );
          })()}
        </Card>
      ) : null}
    </div>
  );
}
