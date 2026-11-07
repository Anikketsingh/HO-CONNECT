'use client';

import { qrCodeDetailSchema, type QrCodeDetail } from '@hoc/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PosterLayout, TRYON_POSTER } from '@/components/partner-poster';
import { svgDataUrl } from '@/components/qr-tools';
import { Alert, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

/** A printable A4 poster for a custom QR code (staff only: it needs the dashboard login). */
export default function CustomQrPosterPage() {
  const { id } = useParams<{ id: string }>();
  const [qr, setQr] = useState<QrCodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(`/v1/admin/qr-codes/${id}`, qrCodeDetailSchema).then(setQr, (e: unknown) => setError(errorMessage(e)));
  }, [id]);

  if (error) return <main className="p-8"><Alert>{error}</Alert></main>;
  if (!qr) return <main className="p-8"><Spinner /></main>;

  const text = qr.destination === 'tryon' ? TRYON_POSTER : { title: 'Discover HairOriginals', subtitle: 'Scan with your phone camera to see more.' };
  return <PosterLayout eyebrow={qr.label} {...text} qrSrc={svgDataUrl(qr.qrSvg)} qrAlt={`QR code: ${qr.name}`} />;
}
