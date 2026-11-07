'use client';

import { useState } from 'react';
import { Button, cx } from '@/components/ui';
import { errorMessage } from '@/lib/api';

/** Saves the server-made SVG as is, or drawn onto a canvas as a large PNG (what printers and WhatsApp want). */
export async function downloadQr(svg: string, fileName: string, as: 'svg' | 'png') {
  let blob: Blob;
  if (as === 'svg') {
    blob = new Blob([svg], { type: 'image/svg+xml' });
  } else {
    const size = 1200;
    // The QR library's SVG has only a viewBox; give it a size so every browser draws it sharp.
    const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
    const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not draw the QR code'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the PNG'))), 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileName}.${as}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** A file-name-safe version of a name: "Andheri store, counter" → "andheri-store-counter". */
export const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'qr';

export function QrImage({ svg, alt, className }: { svg: string; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={svgDataUrl(svg)} alt={alt} className={cx('mx-auto rounded-xl border border-line bg-white p-2', className ?? 'size-48')} width={192} height={192} />
  );
}

/** The UTM tags on a link: what the CRM will show for visitors from it. */
export function utmTags(link: string): [string, string][] {
  const q = link.split('#')[0]!.split('?')[1] ?? '';
  return q
    .split('&')
    .filter((p) => p.startsWith('utm_'))
    .map((p) => {
      const [k, v = ''] = p.split('=');
      return [k!, decodeURIComponent(v)];
    });
}

export function UtmTags({ link, title = 'Shows on the CRM lead as' }: { link: string; title?: string }) {
  const tags = utmTags(link);
  if (!tags.length) return null;
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs font-semibold text-ink">{title}</p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
        {tags.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="break-all text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The link with a copy button. */
export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <p className="min-w-0 flex-1 break-all rounded-md bg-blush/40 px-2 py-1.5 font-mono text-[11px] leading-snug text-muted select-all">{link}</p>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          void navigator.clipboard.writeText(link).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => window.prompt('Copy the link:', link),
          )
        }
      >
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  );
}

/** Download PNG / SVG buttons. Errors go to `onError`. */
export function DownloadButtons({ svg, fileName, onError }: { svg: string; fileName: string; onError: (msg: string) => void }) {
  const save = (as: 'svg' | 'png') => downloadQr(svg, fileName, as).catch((e: unknown) => onError(errorMessage(e)));
  return (
    <>
      <Button size="sm" onClick={() => void save('png')}>
        Download PNG
      </Button>
      <Button size="sm" variant="outline" onClick={() => void save('svg')}>
        SVG
      </Button>
    </>
  );
}
