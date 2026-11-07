'use client';

import { formatINR, funnelReportSchema, metricsSchema, REPORT_GROUPS, type FunnelReport, type Metrics, type ReportGroup } from '@hoc/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { inputClass, Labeled } from '@/components/settings-tabs';
import { Alert, Button, Card, cx, PageHeader, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { daysAgoIST, downloadCsv, formatHours, formatPercent, todayIST } from '@/lib/format';

const GROUPS: Record<ReportGroup, string> = { partner: 'By partner', city: 'By city', centre: 'By experience centre' };

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1.5 font-display text-3xl text-espresso tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

export default function ReportsPage() {
  const [tab, setTab] = useState<'funnel' | 'metrics'>('funnel');
  const [by, setBy] = useState<ReportGroup>('partner');
  const [from, setFrom] = useState(daysAgoIST(29));
  const [to, setTo] = useState(todayIST());
  const [funnel, setFunnel] = useState<FunnelReport | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (tab === 'funnel') setFunnel(await api(`/v1/admin/reports/funnel?by=${by}&from=${from}&to=${to}`, funnelReportSchema));
      else setMetrics(await api(`/v1/admin/reports/metrics?from=${from}&to=${to}`, metricsSchema));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [tab, by, from, to]);
  useEffect(() => {
    if (from && to && from <= to) void load();
  }, [load, from, to]);

  const preset = (days: number) => {
    setFrom(daysAgoIST(days - 1));
    setTo(todayIST());
  };

  return (
    <div>
      <PageHeader eyebrow="Reports" title="How the programme is doing" />
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <Labeled label="From">
          <input type="date" className={cx(inputClass, 'w-44')} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Labeled>
        <Labeled label="To">
          <input type="date" className={cx(inputClass, 'w-44')} value={to} min={from} max={todayIST()} onChange={(e) => setTo(e.target.value)} />
        </Labeled>
        {[7, 30, 90].map((d) => (
          <Button key={d} size="sm" variant="outline" onClick={() => preset(d)}>
            Last {d} days
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Counts the leads that were added in this period, and how far each of them has got since.</p>

      <nav className="mt-6 flex gap-1 border-b border-line" aria-label="Report">
        {(['funnel', 'metrics'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? 'page' : undefined}
            className={cx('-mb-px border-b-2 px-3 py-2.5 text-sm font-medium', tab === t ? 'border-primary text-primary-deep' : 'border-transparent text-muted hover:text-ink')}
          >
            {t === 'funnel' ? 'Lead funnel' : 'Pilot metrics'}
          </button>
        ))}
      </nav>

      <div className="mt-6 space-y-4">
        {error ? <Alert>{error}</Alert> : null}

        {tab === 'funnel' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1">
                {REPORT_GROUPS.map((g) => (
                  <Button key={g} size="sm" variant={by === g ? 'primary' : 'outline'} onClick={() => setBy(g)}>
                    {GROUPS[g]}
                  </Button>
                ))}
              </div>
              {funnel ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadCsv(`ho-connect-funnel-${by}-${funnel.from}-to-${funnel.to}.csv`, [
                      ['Name', 'Added', 'Customer confirmed', 'Verified', 'Consultation booked', 'Consultation done', 'Purchased', 'Commission (INR)'],
                      ...funnel.rows.map((r) => [r.label, r.added, r.confirmed, r.verified, r.booked, r.consulted, r.purchased, (r.commissionPaise / 100).toFixed(2)]),
                      ['Total', funnel.totals.added, funnel.totals.confirmed, funnel.totals.verified, funnel.totals.booked, funnel.totals.consulted, funnel.totals.purchased, (funnel.totals.commissionPaise / 100).toFixed(2)],
                    ])
                  }
                >
                  Download CSV
                </Button>
              ) : null}
            </div>
            {!funnel ? (
              <Spinner />
            ) : funnel.rows.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted">No leads were added in this period.</Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="border-b border-line bg-paper text-right text-xs font-semibold uppercase tracking-wide text-muted">
                        <th className="px-4 py-3 text-left">{GROUPS[by].replace('By ', '')}</th>
                        <th className="px-3 py-3">Added</th>
                        <th className="px-3 py-3">Confirmed</th>
                        <th className="px-3 py-3">Verified</th>
                        <th className="px-3 py-3">Booked</th>
                        <th className="px-3 py-3">Consulted</th>
                        <th className="px-3 py-3">Purchased</th>
                        <th className="px-3 py-3">Added → bought</th>
                        <th className="px-4 py-3">Commission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line tabular-nums">
                      {funnel.rows.map((r) => (
                        <tr key={r.key} className="text-right">
                          <td className="px-4 py-2.5 text-left font-medium text-ink">{r.label}</td>
                          <td className="px-3 py-2.5">{r.added}</td>
                          <td className="px-3 py-2.5">{r.confirmed}</td>
                          <td className="px-3 py-2.5">{r.verified}</td>
                          <td className="px-3 py-2.5">{r.booked}</td>
                          <td className="px-3 py-2.5">{r.consulted}</td>
                          <td className="px-3 py-2.5 font-semibold text-espresso">{r.purchased}</td>
                          <td className="px-3 py-2.5 text-muted">{pct(r.purchased, r.added)}</td>
                          <td className="px-4 py-2.5">{formatINR(r.commissionPaise)}</td>
                        </tr>
                      ))}
                      <tr className="bg-paper text-right font-semibold">
                        <td className="px-4 py-2.5 text-left">Total</td>
                        <td className="px-3 py-2.5">{funnel.totals.added}</td>
                        <td className="px-3 py-2.5">{funnel.totals.confirmed}</td>
                        <td className="px-3 py-2.5">{funnel.totals.verified}</td>
                        <td className="px-3 py-2.5">{funnel.totals.booked}</td>
                        <td className="px-3 py-2.5">{funnel.totals.consulted}</td>
                        <td className="px-3 py-2.5">{funnel.totals.purchased}</td>
                        <td className="px-3 py-2.5 text-muted">{pct(funnel.totals.purchased, funnel.totals.added)}</td>
                        <td className="px-4 py-2.5">{formatINR(funnel.totals.commissionPaise)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            <p className="text-xs text-muted">
              Confirmed = the customer entered the SMS code. Verified = tagged by an agent as a real customer. Booked, Consulted = ever reached that stage.
              Commission excludes rejected and reversed ones. Sorted by purchases: this is also the partner leaderboard.
            </p>
          </>
        ) : !metrics ? (
          <Spinner />
        ) : (
          <>
            <h2 className="font-display text-2xl text-espresso">Partners and leads</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Active partners" value={`${metrics.partners.active} of ${metrics.partners.approved}`} hint="Added at least one lead in the period" />
              <Stat label="Leads per active partner, per week" value={metrics.leads.perActivePartnerPerWeek ?? '—'} hint={`${metrics.leads.added} leads in ${metrics.days} days`} />
              <Stat label="Consent rate" value={formatPercent(metrics.leads.consentRate)} hint={`${metrics.leads.confirmed} of ${metrics.leads.added} customers confirmed by OTP`} />
              <Stat label="New customers" value={formatPercent(metrics.leads.newShare)} hint={`${metrics.leads.newCustomers} new, ${metrics.leads.alreadyConnected} already connected with HO`} />
              <Stat label="Lead → purchase" value={formatPercent(metrics.leads.purchaseConversion)} hint={`${metrics.leads.purchased} purchases from ${metrics.leads.verified} verified leads. Compare with your ad leads by hand`} />
              <Stat label="Partners still active after 60 days" value={formatPercent(metrics.retention.rate)} hint={metrics.retention.cohort ? `${metrics.retention.retained} of ${metrics.retention.cohort} approved 60+ days ago added a lead in the last 30 days` : 'No partner has been approved for 60 days yet'} />
            </div>

            <h2 className="pt-4 font-display text-2xl text-espresso">Speed</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Waiting for verification now" value={metrics.speed.waitingNow} hint={metrics.speed.oldestWaitingHours !== null ? `Oldest has waited ${formatHours(metrics.speed.oldestWaitingHours)}` : undefined} />
              <Stat label="Time to verify (typical)" value={formatHours(metrics.speed.verifyWaitHours?.median ?? null)} hint={metrics.speed.verifyWaitHours ? `Average ${formatHours(metrics.speed.verifyWaitHours.avg)}, slowest 1 in 10: ${formatHours(metrics.speed.verifyWaitHours.p90)}` : 'No verified leads yet'} />
              <Stat label="Time to first contact (typical)" value={formatHours(metrics.speed.firstContactHours?.median ?? null)} hint={metrics.speed.firstContactHours ? `From the customer's confirmation to "In touch". Average ${formatHours(metrics.speed.firstContactHours.avg)}` : 'No leads marked "In touch" yet'} />
            </div>

            <h2 className="pt-4 font-display text-2xl text-espresso">Money</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Commissions created" value={metrics.money.commissions} hint={`Worth ${formatINR(metrics.money.totalCommissionPaise)}`} />
              <Stat label="Average commission per sale" value={metrics.money.avgCommissionPaise === null ? '—' : formatINR(metrics.money.avgCommissionPaise)} hint="Compare with your ad cost per customer" />
              <Stat label="Paid out in the period" value={formatINR(metrics.money.paidOutPaise)} />
              <Stat label="Days from sale to payout" value={metrics.money.avgDaysSaleToPayout ?? '—'} hint="Average, for payouts made in the period" />
            </div>
            <Card className="p-4">
              <p className="text-sm font-medium text-muted">Commissions created in the period, by status</p>
              <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(metrics.money.byStatus).map(([s, v]) => (
                  <div key={s} className="flex justify-between border-b border-line/60 py-1.5">
                    <dt className="capitalize text-muted">{s.replace('_', ' ')}</dt>
                    <dd className="tabular-nums text-ink">{formatINR(v)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
