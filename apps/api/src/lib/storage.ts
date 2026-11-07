import { createClient } from '@supabase/supabase-js';

/** Where partner documents live. Supabase Storage in production; in-memory in tests. */
export interface DocumentStorage {
  put(path: string, bytes: Buffer, contentType: string): Promise<void>;
  /** Deletes files (used when an account is closed). Missing files are ignored. */
  remove(paths: string[]): Promise<void>;
  /** Short-lived URLs to view files, keyed by path. Missing files are left out. */
  signedUrls(paths: string[], expiresInSeconds: number): Promise<Map<string, string>>;
}

export const PARTNER_DOCUMENTS_BUCKET = 'partner-documents';

/** Private bucket, accessed only with the secret (service role) key from the API. */
export function createSupabaseStorage(opts: { url: string; serviceKey: string; bucket?: string }): DocumentStorage {
  const client = createClient(opts.url, opts.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bucket = client.storage.from(opts.bucket ?? PARTNER_DOCUMENTS_BUCKET);

  return {
    async put(path, bytes, contentType) {
      const { error } = await bucket.upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket.remove(paths);
      if (error) throw new Error(`Storage delete failed: ${error.message}`);
    },
    async signedUrls(paths, expiresInSeconds) {
      const out = new Map<string, string>();
      if (paths.length === 0) return out;
      const { data, error } = await bucket.createSignedUrls(paths, expiresInSeconds);
      if (error || !data) return out;
      for (const item of data) {
        if (item.path && item.signedUrl && !item.error) out.set(item.path, item.signedUrl);
      }
      return out;
    },
  };
}
