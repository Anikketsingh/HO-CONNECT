import type { ACCEPTED_UPLOAD_TYPES } from '@hoc/shared';

export type UploadMime = (typeof ACCEPTED_UPLOAD_TYPES)[number];

/**
 * Works out the file type from its first bytes. The client's file name and
 * Content-Type are not trusted: a renamed .exe must not be stored as a "photo".
 */
export function sniffMimeType(b: Buffer): UploadMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (b.length >= 5 && b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export const EXTENSION: Record<UploadMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Keeps a readable original name for display; never used as a storage path. */
export function displayFileName(name: string | undefined, mime: UploadMime): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^\w.\- ()]/g, '').trim().slice(0, 100);
  return cleaned || `upload.${EXTENSION[mime]}`;
}
