'use client';

import { publicReferralSchema } from '@hoc/shared';
import { useEffect, useState } from 'react';
import { Alert, Button, Logo, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { API_URL } from '@/lib/env';
import { publicApi } from '@/lib/public-api';

/** An A4 poster around a QR code: print it or save it as a PDF. The button hides when printing. */
export function PosterLayout({ eyebrow, title, subtitle, qrSrc, qrAlt, footer }: { eyebrow?: string | null; title: string; subtitle: string; qrSrc: string; qrAlt: string; footer?: string | null }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[210mm] flex-col items-center px-8 py-10 text-center print:min-h-0 print:py-0">
      <Logo className="w-44" />
      {eyebrow ? <p className="mt-10 text-sm font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p> : <div className="mt-10" />}
      <h1 className="mt-3 font-display text-5xl leading-tight text-espresso">{title}</h1>
      <p className="mt-4 text-lg text-muted">{subtitle}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrSrc} alt={qrAlt} className="mt-10 size-80 rounded-2xl border border-line" width={320} height={320} />
      {footer ? <p className="mt-6 break-all font-mono text-sm text-muted">{footer}</p> : null}
      <Button className="mt-10 print:hidden" onClick={() => window.print()}>
        Print or save as PDF
      </Button>
    </main>
  );
}

export const TRYON_POSTER = {
  title: 'See the new you before you decide',
  subtitle: "Scan with your phone camera and try HairOriginals hair on your own photo. It's free and takes a minute.",
};

/** A partner's poster (public, approved partners only). Opened from the app's "Share" screen or the dashboard's partner page. */
export function PartnerPoster({
  code,
  qrPath,
  eyebrow,
  title,
  subtitle,
  footer,
}: {
  code: string;
  /** Under /v1/public/referral/<code>/ */
  qrPath: 'qr.svg' | 'tryon-qr.svg';
  eyebrow: (partnerName: string) => string;
  title: string;
  subtitle: string;
  footer?: string;
}) {
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicApi(`/referral/${encodeURIComponent(code)}`, publicReferralSchema).then((r) => setName(r.partnerName), (e: unknown) => setError(errorMessage(e)));
  }, [code]);

  if (error) return <main className="p-8"><Alert>{error}</Alert></main>;
  if (!name) return <main className="p-8"><Spinner /></main>;

  return (
    <PosterLayout
      eyebrow={eyebrow(name)}
      title={title}
      subtitle={subtitle}
      qrSrc={`${API_URL}/v1/public/referral/${encodeURIComponent(code)}/${qrPath}`}
      qrAlt={`QR code for ${name}`}
      footer={footer}
    />
  );
}
