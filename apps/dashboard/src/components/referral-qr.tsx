'use client';

import { adminPartnerReferralSchema, type AdminPartnerReferral, type ShareTarget } from '@hoc/shared';
import { useCallback, useEffect, useState } from 'react';
import { CopyLink, DownloadButtons, QrImage, UtmTags } from '@/components/qr-tools';
import { Alert, Card, cx } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

type Kind = 'referral' | 'tryon';

const KINDS: { kind: Kind; label: string; about: string }[] = [
  {
    kind: 'referral',
    label: 'Referral page',
    about: 'Customers leave their name and number and confirm with an SMS code. The lead is credited to this partner here in HO Connect.',
  },
  {
    kind: 'tryon',
    label: 'AI try-on',
    about: 'Opens the AI try-on app. When the customer signs in there, the lead goes to the CRM tagged with this partner’s code.',
  },
];

/** A partner's QR codes (HO Connect referral page and AI try-on), so staff can download or print them for the partner. */
export function ReferralQrCard({ partnerId }: { partnerId: string }) {
  const [data, setData] = useState<AdminPartnerReferral | null>(null);
  const [kind, setKind] = useState<Kind>('referral');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api(`/v1/admin/partners/${partnerId}/referral`, adminPartnerReferralSchema));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [partnerId]);
  useEffect(() => {
    void load();
  }, [load]);

  const target: ShareTarget | null = data ? (kind === 'tryon' ? data.tryOn : data) : null;
  const about = KINDS.find((k) => k.kind === kind)!.about;

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-espresso">QR codes</h2>
      <p className="mt-1 text-sm text-muted">The same codes the partner sees in their app. Print them for their counter or send them over.</p>

      <div role="tablist" aria-label="Which QR code" className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-blush/60 p-1">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            role="tab"
            aria-selected={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={cx('h-8 rounded-md text-xs font-semibold transition-colors', kind === k.kind ? 'bg-white text-espresso shadow-sm' : 'text-muted hover:text-ink')}
          >
            {k.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {data && !data.active ? (
        <div className="mt-3">
          <Alert tone="info">
            This partner is not active: their referral page says so, and posters can’t be opened. The AI try-on code still opens the try-on app and
            tags leads with their code.
          </Alert>
        </div>
      ) : null}

      {data && target ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ink">{about}</p>
          <QrImage svg={target.qrSvg} alt={`${kind === 'tryon' ? 'AI try-on' : 'Referral'} QR code for ${data.code}`} />
          <CopyLink link={target.link} />
          {kind === 'tryon' ? (
            <div>
              <UtmTags link={target.qrLink} title="Scans show on the CRM lead as" />
              <p className="mt-1.5 text-[11px] leading-snug text-muted">Shared links use utm_medium=partner_link, so you can tell scans from taps.</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <DownloadButtons svg={target.qrSvg} fileName={`${data.code}-${kind === 'tryon' ? 'ai-tryon' : 'referral'}-qr`} onError={setError} />
            {data.active ? (
              <a href={target.posterUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold text-primary hover:bg-blush">
                Printable poster ↗
              </a>
            ) : null}
          </div>
        </div>
      ) : !error ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : null}
    </Card>
  );
}
