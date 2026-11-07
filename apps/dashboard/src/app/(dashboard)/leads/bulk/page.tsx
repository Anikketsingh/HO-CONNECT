'use client';

import { BULK_CSV_TEMPLATE, bulkJobSchema, type BulkJob } from '@hoc/shared';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Alert, Button, Card, cx, PageHeader, Pill } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { STAGE_LABELS } from '@/lib/format';

const OUTCOME: Record<string, { label: string; tone: 'good' | 'bad' | 'wait' | 'neutral' }> = {
  valid: { label: 'Will update', tone: 'good' },
  no_change: { label: 'No change', tone: 'neutral' },
  invalid: { label: 'Invalid', tone: 'bad' },
  applied: { label: 'Updated', tone: 'good' },
  skipped: { label: 'Skipped', tone: 'wait' },
};

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([BULK_CSV_TEMPLATE], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ho-connect-stage-update.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkCsvPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [job, setJob] = useState<BulkJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function preview(file: File) {
    setError(null);
    setJob(null);
    if (file.size > 1_000_000) {
      setError('The file is larger than 1 MB. Split it into smaller files.');
      return;
    }
    setBusy(true);
    try {
      setJob(await api('/v1/admin/leads/bulk-csv/preview', bulkJobSchema, { method: 'POST', json: { csv: await file.text(), fileName: file.name } }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function apply() {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await api(`/v1/admin/bulk-jobs/${job.id}/apply`, bulkJobSchema, { method: 'POST' }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const count = (o: string) => job?.rows.filter((r) => r.outcome === o).length ?? 0;
  const applied = job?.status === 'applied';

  return (
    <div>
      <Link href="/leads?view=open" className="text-sm font-medium text-primary hover:text-primary-deep">
        ← Leads
      </Link>
      <div className="mt-3">
        <PageHeader eyebrow="Leads" title="Update stages from a CSV" />
      </div>

      <Card className="mt-6 p-5">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
          <li>
            One row per lead. Identify it with <code className="font-mono text-xs">lead_ref</code> (e.g. L-000123) or{' '}
            <code className="font-mono text-xs">phone</code>.
          </li>
          <li>
            <code className="font-mono text-xs">stage</code>: in_touch, consultation_booked, consultation_done, unreachable or closed_lost.
          </li>
          <li>
            For consultation_booked, add <code className="font-mono text-xs">consultation_mode</code> (ec_visit, home_trial, video) and
            optionally <code className="font-mono text-xs">consultation_at</code> (2026-11-20 16:30, India time).
          </li>
          <li>
            <code className="font-mono text-xs">note</code> is optional and internal.
          </li>
        </ol>
        <p className="mt-3 text-sm text-muted">Nothing changes until you check the preview and click Apply.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            Download template
          </Button>
          <Button onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy && !job ? 'Checking…' : 'Choose CSV file'}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void preview(f);
            }}
          />
        </div>
      </Card>

      {error ? (
        <div className="mt-6">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {job ? (
        <Card className="mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
            <div>
              <h2 className="font-semibold text-espresso">
                {applied ? 'Applied' : 'Preview'}: {job.fileName ?? 'CSV'}
              </h2>
              <p className="text-sm text-muted">
                {applied
                  ? `${job.appliedRows} updated · ${count('skipped')} skipped · ${count('invalid')} invalid · ${count('no_change')} unchanged`
                  : `${count('valid')} will update · ${count('invalid')} invalid · ${count('no_change')} unchanged`}
              </p>
            </div>
            {!applied ? (
              <Button disabled={busy || count('valid') === 0} onClick={apply}>
                {busy ? 'Applying…' : `Apply ${count('valid')} row${count('valid') === 1 ? '' : 's'}`}
              </Button>
            ) : (
              <Link href="/leads?view=open">
                <Button variant="outline">Back to leads</Button>
              </Link>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {job.rows.map((r) => (
                  <tr key={r.row} className={cx(r.outcome === 'invalid' && 'bg-danger/5')}>
                    <td className="px-4 py-2.5 text-muted tabular-nums">{r.row}</td>
                    <td className="px-4 py-2.5">
                      {r.leadId ? (
                        <Link href={`/leads/${r.leadId}`} className="font-medium text-ink hover:text-primary">
                          {r.ref}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      {r.customerName ? <span className="block text-xs text-muted">{r.customerName}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {r.currentStage ? STAGE_LABELS[r.currentStage] : '?'} → {r.stage ? (STAGE_LABELS[r.stage] ?? r.stage) : '?'}
                    </td>
                    <td className="px-4 py-2.5">
                      <Pill tone={OUTCOME[r.outcome]!.tone}>{OUTCOME[r.outcome]!.label}</Pill>
                      {r.reason ? <span className="ml-2 text-xs text-muted">{r.reason}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
