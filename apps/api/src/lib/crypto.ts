import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM field encryption for PAN and bank/UPI details.
 * Output format: "v1.<iv>.<authTag>.<ciphertext>" (each part base64url).
 * The version prefix allows key rotation later.
 */
export interface FieldCipher {
  encrypt(plaintext: string): string;
  decrypt(payload: string): string;
}

export function createFieldCipher(base64Key: string): FieldCipher {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  }

  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return ['v1', iv, tag, ciphertext].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
    },
    decrypt(payload) {
      const [version, iv, tag, ciphertext] = payload.split('.');
      if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unrecognised ciphertext format');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
    },
  };
}
