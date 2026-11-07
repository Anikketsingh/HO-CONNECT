'use client';

import { formatINR, planListSchema, recordSaleResultSchema, salePreviewSchema, type AdminLeadDetail, type SalePreview } from '@hoc/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { inputClass, Labeled } from '@/components/settings-tabs';
import { Alert, Button, Card, Pill } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { COMMISSION_STATUS_LABELS, formatDate, rupeesToPaiseInput, todayIST } from '@/lib/format';

type Line = { categoryId: string; net: string };

/** Sales on the lead, and the form to record one (with a commission preview before saving). */
export function SalesCard({ lead, canRecord, onRecorded }: { lead: AdminLeadDetail; canRecord: boolean; onRecorded: (msg: string) => Promise<void> }) {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [saleDate, setSaleDate] = useState(todayIST());
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lines, setLines] = useState<Line[]>([{ categoryId: '', net: '' }]);
  const [linkedManually, setLinkedManually] = useState(false);
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<SalePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && categories.length === 0) {
      api('/v1/admin/commission-plans', planListSchema).then((p) => setCategories(p.categories), () => {});
    }
  }, [open, categories.length]);

  const body = () => ({
    saleDate,
    invoiceNo: invoiceNo.trim() || undefined,
    lines: lines.map((l) => ({ categoryId: l.categoryId, netPaise: rupeesToPaiseInput(l.net) ?? 0 })),
    linkedManually,
    notes: notes.trim() || undefined,
  });
  const ready = lines.every((l) => l.categoryId && (rupeesToPaiseInput(l.net) ?? 0) > 0);
  const changed = () => setPreview(null);

  async function doPreview() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await api(`/v1/admin/leads/${lead.id}/sales/preview`, salePreviewSchema, { method: 'POST', json: body() }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/v1/admin/leads/${lead.id}/sales`, recordSaleResultSchema, { method: 'POST', json: body() });
      setOpen(false);
      setPreview(null);
      setLines([{ categoryId: '', net: '' }]);
      setInvoiceNo('');
      setNotes('');
      await onRecorded(
        r.commissionId
          ? `Sale recorded. Commission of ${formatINR(r.preview.totalPaise)} is on hold until ${formatDate(r.preview.holdUntil)}.`
          : `Sale recorded with no commission: ${r.preview.ineligibleReason}`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-espresso">Sales</h2>
        {canRecord && !open ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            Record a sale
          </Button>
        ) : null}
      </div>
      {lead.sales.length ? (
        <ul className="mt-3 divide-y divide-line/60 text-sm">
          {lead.sales.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-ink">
                {formatDate(s.saleDate)} · {formatINR(s.totalNetPaise)}
                {s.invoiceNo ? <span className="text-muted"> · {s.invoiceNo}</span> : null}
                {s.status !== 'active' ? <span className="text-danger"> · {s.status}</span> : null}
              </span>
              {s.commission ? (
                <Link href={`/commissions/${s.commission.id}`} className="flex items-center gap-2 text-primary">
                  {formatINR(s.commission.amountPaise)} <Pill>{COMMISSION_STATUS_LABELS[s.commission.status]}</Pill>
                </Link>
              ) : (
                <span className="text-xs text-muted">No commission</span>
              )}
            </li>
          ))}
        </ul>
      ) : !open ? (
        <p className="mt-2 text-sm text-muted">No sales yet.</p>
      ) : null}

      {open ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Sale date">
              <input type="date" max={todayIST()} className={inputClass} value={saleDate} onChange={(e) => { setSaleDate(e.target.value); changed(); }} />
            </Labeled>
            <Labeled label="Invoice number (optional)">
              <input className={inputClass} value={invoiceNo} onChange={(e) => { setInvoiceNo(e.target.value); changed(); }} />
            </Labeled>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Lines: net value excluding GST and the home-trial fee</p>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    aria-label="Category"
                    className={inputClass}
                    value={l.categoryId}
                    onChange={(e) => { setLines(lines.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x))); changed(); }}
                  >
                    <option value="">Category…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Net value in rupees"
                    className={`${inputClass} w-40`}
                    inputMode="decimal"
                    placeholder="₹ net"
                    value={l.net}
                    onChange={(e) => { setLines(lines.map((x, j) => (j === i ? { ...x, net: e.target.value } : x))); changed(); }}
                  />
                  {lines.length > 1 ? (
                    <Button size="sm" variant="ghost" aria-label="Remove line" onClick={() => { setLines(lines.filter((_, j) => j !== i)); changed(); }}>
                      ×
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <Button className="mt-2" size="sm" variant="ghost" onClick={() => setLines([...lines, { categoryId: '', net: '' }])}>
              + Add a line
            </Button>
          </div>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={linkedManually} onChange={(e) => { setLinkedManually(e.target.checked); changed(); }} />
            <span>
              The customer bought with a different number or name, and I matched it to this lead by hand
              <span className="block text-xs text-muted">The commission will be flagged for review.</span>
            </span>
          </label>
          <Labeled label="Internal note (optional)">
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Labeled>

          {error ? <Alert>{error}</Alert> : null}

          {preview ? (
            <div className="rounded-xl border border-line bg-paper p-4 text-sm">
              {preview.eligible ? (
                <>
                  <p className="font-semibold text-ink">
                    Commission: {formatINR(preview.totalPaise)}{' '}
                    <span className="font-normal text-muted">
                      · plan "{preview.plan?.name ?? 'none'}" · on hold until {formatDate(preview.holdUntil)}
                    </span>
                  </p>
                  <ul className="mt-2 space-y-1 text-muted">
                    {preview.lines.map((l, i) => (
                      <li key={i}>
                        {l.categoryName} {formatINR(l.netPaise)} → {l.rule ?? 'no matching rule'} = <span className="text-ink">{formatINR(l.amountPaise)}</span>
                      </li>
                    ))}
                  </ul>
                  {preview.flags.length ? (
                    <p className="mt-2 text-xs text-espresso">Flagged for review: {preview.flags.map((f) => f.label).join('; ')}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-ink">
                  <span className="font-semibold">No commission:</span> {preview.ineligibleReason} The sale will still be recorded.
                </p>
              )}
            </div>
          ) : null}

          <div className="flex gap-2">
            {preview ? (
              <Button disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Save sale'}
              </Button>
            ) : (
              <Button disabled={busy || !ready} onClick={doPreview}>
                {busy ? 'Checking…' : 'Preview commission'}
              </Button>
            )}
            <Button variant="ghost" onClick={() => { setOpen(false); setPreview(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
