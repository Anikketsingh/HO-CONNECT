'use client';

import { QR_DESTINATION_LABELS, QR_KIND_LABELS, qrCodeListSchema, type QrCode } from '@hoc/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Card, cx, PageHeader, Pill, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';

/** Custom QR codes for HO stores, events and anything else that is not a partner. */
export default function QrCodesPage() {
  const [archived, setArchived] = useState(false);
  const [items, setItems] = useState<QrCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    api(`/v1/admin/qr-codes?archived=${archived}`, qrCodeListSchema).then(
      (r) => !cancelled && setItems(r.items),
      (e: unknown) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [archived]);

  return (
    <div>
      <PageHeader eyebrow="Marketing" title="QR codes">
        <Link href="/qr-codes/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-deep">
          New QR code
        </Link>
      </PageHeader>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        For HO stores, events, flyers and anything else that isn’t a partner. Each code opens the AI try-on app or a web page with UTM tags, so leads
        in the CRM show where they came from. Partners’ own codes are on each partner’s page.
      </p>

      <div className="mt-6 flex gap-1 border-b border-line">
        {[false, true].map((a) => (
          <button
            key={String(a)}
            onClick={() => setArchived(a)}
            aria-current={archived === a ? 'page' : undefined}
            className={cx('-mb-px border-b-2 px-3 py-2.5 text-sm font-medium', archived === a ? 'border-primary text-primary-deep' : 'border-transparent text-muted hover:text-ink')}
          >
            {a ? 'Archived' : 'In use'}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {error ? <Alert>{error}</Alert> : null}
        {!items && !error ? <Spinner /> : null}
        {items && items.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            {archived ? 'Nothing archived.' : (
              <>
                No QR codes yet.{' '}
                <Link href="/qr-codes/new" className="font-semibold text-primary">
                  Make the first one
                </Link>
                .
              </>
            )}
          </Card>
        ) : null}
        {items && items.length > 0 ? (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Opens</th>
                  <th className="px-4 py-3">utm_source / utm_campaign</th>
                  <th className="px-4 py-3">Made</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((q) => (
                  <tr key={q.id} className="hover:bg-blush/40">
                    <td className="px-4 py-3">
                      <Link href={`/qr-codes/${q.id}`} className="block font-semibold text-ink hover:text-primary">
                        {q.name}
                      </Link>
                      {q.label ? <span className="text-xs text-muted">{q.label}</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <Pill>{QR_KIND_LABELS[q.kind]}</Pill>
                    </td>
                    <td className="px-4 py-3 text-muted">{q.destination === 'tryon' ? QR_DESTINATION_LABELS.tryon : (q.targetUrl ?? '').replace(/^https:\/\//, '').slice(0, 40)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {q.utmSource} / {q.utmCampaign}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {timeAgo(q.createdAt)}
                      {q.createdBy ? <span className="block text-xs">by {q.createdBy}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
