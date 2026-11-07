'use client';

import { QR_DESTINATION_LABELS, QR_KIND_LABELS, qrCodeDetailSchema, type QrCodeDetail } from '@hoc/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CopyLink, DownloadButtons, fileSlug, QrImage, UtmTags } from '@/components/qr-tools';
import { inputClass, Labeled } from '@/components/settings-tabs';
import { Alert, Button, Card, cx, Pill, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children ?? '—'}</dd>
    </div>
  );
}

/** One custom QR code: download, print, rename, archive. The link itself never changes. */
export default function QrCodePage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useAuth();
  const isAdmin = state.status === 'ready' && state.admin.role === 'admin';
  const [qr, setQr] = useState<QrCodeDetail | null>(null);
  const [form, setForm] = useState({ name: '', label: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const show = useCallback((q: QrCodeDetail) => {
    setQr(q);
    setForm({ name: q.name, label: q.label ?? '', notes: q.notes ?? '' });
  }, []);

  useEffect(() => {
    api(`/v1/admin/qr-codes/${id}`, qrCodeDetailSchema).then(show, (e: unknown) => setError(errorMessage(e)));
  }, [id, show]);

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      show(await api(`/v1/admin/qr-codes/${id}`, qrCodeDetailSchema, { method: 'PATCH', json: body }));
      setNotice(done);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!qr) {
    return (
      <div className="space-y-4">
        <Link href="/qr-codes" className="text-sm font-medium text-primary">
          ← QR codes
        </Link>
        {error ? <Alert>{error}</Alert> : <Spinner />}
      </div>
    );
  }

  const dirty = form.name.trim() !== qr.name || form.label.trim() !== (qr.label ?? '') || form.notes.trim() !== (qr.notes ?? '');

  return (
    <div>
      <Link href="/qr-codes" className="text-sm font-medium text-primary hover:text-primary-deep">
        ← QR codes
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl text-espresso">{qr.name}</h1>
        <Pill>{QR_KIND_LABELS[qr.kind]}</Pill>
        {qr.archivedAt ? <Pill tone="wait">Archived</Pill> : null}
      </div>
      <p className="mt-1 text-sm text-muted">
        Made {formatDateTime(qr.createdAt)}
        {qr.createdBy ? ` by ${qr.createdBy}` : ''}
      </p>

      <div className="mt-6 space-y-3">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        {qr.archivedAt ? <Alert tone="info">Archived codes are only hidden from the list. Printed copies keep working.</Alert> : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="space-y-3 p-5">
          <QrImage svg={qr.qrSvg} alt={`QR code: ${qr.name}`} className="size-64" />
          <CopyLink link={qr.link} />
          <div className="flex flex-wrap gap-2 pt-1">
            <DownloadButtons svg={qr.qrSvg} fileName={`${fileSlug(qr.name)}-qr`} onError={setError} />
            <a href={`/print/qr/${qr.id}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold text-primary hover:bg-blush">
              Printable poster ↗
            </a>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold text-espresso">Where it goes</h2>
            <dl className="mt-2 divide-y divide-line/60">
              <Row label="Opens">{qr.destination === 'tryon' ? QR_DESTINATION_LABELS.tryon : qr.targetUrl}</Row>
            </dl>
            <div className="mt-3">
              <UtmTags link={qr.link} title={qr.destination === 'tryon' ? 'Leads show in the CRM with' : 'Visits are tagged with'} />
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-semibold text-espresso">Details</h2>
            <Labeled label="Name (for the team)">
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Labeled>
            <Labeled label="Poster label (optional)">
              <input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </Labeled>
            <Labeled label="Notes (optional)">
              <textarea className={cx(inputClass, 'h-20 py-2')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Labeled>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={!dirty || busy} onClick={() => void patch({ name: form.name.trim(), label: form.label.trim() || null, notes: form.notes.trim() || null }, 'Saved.')}>
                Save
              </Button>
              {isAdmin ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void patch({ archived: !qr.archivedAt }, qr.archivedAt ? 'Back in the list.' : 'Archived. Printed copies keep working.')}
                >
                  {qr.archivedAt ? 'Restore' : 'Archive'}
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
