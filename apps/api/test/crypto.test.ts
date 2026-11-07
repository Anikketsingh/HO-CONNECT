import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFieldCipher } from '../src/lib/crypto';

describe('createFieldCipher', () => {
  const key = randomBytes(32).toString('base64');
  const cipher = createFieldCipher(key);

  it('round-trips and never repeats ciphertext', () => {
    const a = cipher.encrypt('ABCDE1234F');
    const b = cipher.encrypt('ABCDE1234F');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
    expect(cipher.decrypt(a)).toBe('ABCDE1234F');
  });

  it('detects tampering and wrong keys', () => {
    const payload = cipher.encrypt('{"upi":"priya@okhdfc"}');
    const parts = payload.split('.');
    const tampered = [...parts.slice(0, 3), Buffer.from('tampered').toString('base64url')].join('.');
    expect(() => cipher.decrypt(tampered)).toThrow();
    expect(() => createFieldCipher(randomBytes(32).toString('base64')).decrypt(payload)).toThrow();
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => createFieldCipher(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
