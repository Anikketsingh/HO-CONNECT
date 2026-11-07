'use client';

import {
  QR_CODE_KINDS,
  QR_DESTINATION_LABELS,
  QR_DESTINATIONS,
  QR_KIND_LABELS,
  qrCodeDetailSchema,
  qrCodeInputSchema,
  qrCodePreviewSchema,
  suggestQrUtm,
  TRYON_UTM_SOURCE,
  type QrCodeKind,
  type QrDestination,
} from '@hoc/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CopyLink, QrImage, UtmTags } from '@/components/qr-tools';
import { inputClass, Labeled } from '@/components/settings-tabs';
import { Alert, Button, Card, cx, PageHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

type Utm = { utmSource: string; utmMedium: string; utmCampaign: string; utmContent: string };

const UTM_FIELDS: { key: keyof Utm; label: string; hint: string }[] = [
  { key: 'utmSource', label: 'utm_source', hint: 'Where from, e.g. ho_store, ho_event' },
  { key: 'utmMedium', label: 'utm_medium', hint: 'How, e.g. qr, flyer, standee' },
  { key: 'utmCampaign', label: 'utm_campaign', hint: 'Which store or event, e.g. andheri-store' },
  { key: 'utmContent', label: 'utm_content (optional)', hint: 'Tell apart several codes in one place, e.g. counter, mirror' },
];

/** Make a custom QR code: the form on the left, a live preview of the link and code on the right. */
export default function NewQrCodePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<QrCodeKind>('store');
  const [destination, setDestination] = useState<QrDestination>('tryon');
  const [targetUrl, setTargetUrl] = useState('');
  const [notes, setNotes] = useState('');
  // UTM tags follow the name and type until someone edits them.
  const [utmEdited, setUtmEdited] = useState(false);
  const [utm, setUtm] = useState<Utm>({ ...suggestQrUtm('store', ''), utmContent: '' });
  const [preview, setPreview] = useState<{ link: string; qrSvg: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!utmEdited) setUtm((u) => ({ ...suggestQrUtm(kind, name), utmContent: u.utmContent }));
  }, [kind, name, utmEdited]);

  const body = useMemo(
    () => ({ name, label, kind, destination, targetUrl: destination === 'url' ? targetUrl : '', notes, ...utm }),
    [name, label, kind, destination, targetUrl, notes, utm],
  );
  const parsed = qrCodeInputSchema.safeParse(body);
  const firstIssue = parsed.success ? null : parsed.error.issues[0]!.message;

  // Live preview, a moment after typing stops. Checked here first so half-typed forms don't hit the API.
  useEffect(() => {
    if (!parsed.success) {
      setPreview(null);
      setPreviewError(firstIssue);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api('/v1/admin/qr-codes/preview', qrCodePreviewSchema, { method: 'POST', json: body }).then(
        (p) => {
          if (cancelled) return;
          setPreview(p);
          setPreviewError(null);
        },
        (e: unknown) => !cancelled && setPreviewError(errorMessage(e)),
      );
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const qr = await api('/v1/admin/qr-codes', qrCodeDetailSchema, { method: 'POST', json: body });
      router.push(`/qr-codes/${qr.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <Link href="/qr-codes" className="text-sm font-medium text-primary hover:text-primary-deep">
        ← QR codes
      </Link>
      <div className="mt-3">
        <PageHeader eyebrow="Marketing" title="New QR code" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <Labeled label="Name (for the team)">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Andheri store counter" autoFocus />
            </Labeled>
            <div className="grid gap-4 sm:grid-cols-2">
              <Labeled label="Type">
                <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as QrCodeKind)}>
                  {QR_CODE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {QR_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="Poster label (optional)">
                <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. HairOriginals Andheri" />
              </Labeled>
            </div>

            <fieldset>
              <legend className="text-xs font-medium text-muted">Opens</legend>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {QR_DESTINATIONS.map((d) => (
                  <label key={d} className={cx('flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm', destination === d ? 'border-primary bg-blush/50' : 'border-line')}>
                    <input type="radio" name="destination" checked={destination === d} onChange={() => setDestination(d)} />
                    {QR_DESTINATION_LABELS[d]}
                  </label>
                ))}
              </div>
            </fieldset>
            {destination === 'url' ? (
              <Labeled label="Web address">
                <input className={inputClass} value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://hairoriginals.com/…" inputMode="url" />
              </Labeled>
            ) : (
              <p className="text-xs text-muted">The try-on app sends these tags to the CRM with the lead when the visitor signs in.</p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-espresso">UTM tags</h2>
              {utmEdited ? (
                <button className="text-xs font-semibold text-primary" onClick={() => setUtmEdited(false)}>
                  Use suggested
                </button>
              ) : (
                <span className="text-xs text-muted">Filled in from the name and type</span>
              )}
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {UTM_FIELDS.map((f) => (
                <Labeled key={f.key} label={f.label}>
                  <input
                    className={cx(inputClass, 'font-mono')}
                    value={utm[f.key]}
                    onChange={(e) => {
                      setUtmEdited(true);
                      setUtm({ ...utm, [f.key]: e.target.value.trim() });
                    }}
                  />
                  <span className="font-normal">{f.hint}</span>
                </Labeled>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              utm_source “{TRYON_UTM_SOURCE}” is kept for partner salons’ codes. Use the same tags for the same place every time, so CRM reports add up.
            </p>
          </Card>

          <Card className="p-5">
            <Labeled label="Notes (optional)">
              <textarea className={cx(inputClass, 'h-20 py-2')} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where it's printed, who asked for it…" />
            </Labeled>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold text-espresso">Preview</h2>
            {preview && !previewError ? (
              <>
                <QrImage svg={preview.qrSvg} alt="Preview of the QR code" />
                <CopyLink link={preview.link} />
                <UtmTags link={preview.link} />
              </>
            ) : (
              <p className="text-sm text-muted">{previewError ?? 'Loading…'}</p>
            )}
          </Card>
          {error ? <Alert>{error}</Alert> : null}
          <Button className="w-full" onClick={() => void save()} disabled={busy || !parsed.success}>
            {busy ? 'Saving…' : 'Save QR code'}
          </Button>
          <p className="text-xs text-muted">Once saved, the link can’t change, because it may be printed. To use different tags, make a new code.</p>
        </div>
      </div>
    </div>
  );
}
