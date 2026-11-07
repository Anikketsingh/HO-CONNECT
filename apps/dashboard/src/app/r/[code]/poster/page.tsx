'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PartnerPoster } from '@/components/partner-poster';

/** A printable A4 poster with the partner's referral QR code. */
export default function PosterPage() {
  const { code } = useParams<{ code: string }>();
  const [link, setLink] = useState('');
  useEffect(() => setLink(`${window.location.origin}/r/${code.toUpperCase()}`), [code]);

  return (
    <PartnerPoster
      code={code}
      qrPath="qr.svg"
      eyebrow={(name) => `Recommended by ${name}`}
      title="Talk to a HairOriginals hair expert"
      subtitle="Scan with your phone camera, share your details, and we'll get in touch."
      footer={link}
    />
  );
}
