'use client';

import { useParams } from 'next/navigation';
import { PartnerPoster, TRYON_POSTER } from '@/components/partner-poster';

/**
 * A printable A4 poster with the partner's AI try-on QR code. No typed-in address on this one:
 * only the scanned link carries the partner's code, so someone typing the address would not be credited.
 */
export default function TryOnPosterPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <PartnerPoster
      code={code}
      qrPath="tryon-qr.svg"
      eyebrow={(name) => `At ${name}`}
      {...TRYON_POSTER}
      footer={`Partner ${code.toUpperCase()}`}
    />
  );
}
