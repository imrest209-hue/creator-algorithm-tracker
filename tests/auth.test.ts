import { beforeAll, describe, expect, it } from 'vitest';

// APP_ENCRYPTION_KEY must be set before the crypto module is imported, since
// it is read at call time from process.env - set it up front for this file.
beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('password hashing', () => {
  it('hashes a password and verifies the correct password against it', async () => {
    const { hashPassword, verifyPassword } = await import('@/lib/auth/session');
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const { hashPassword, verifyPassword } = await import('@/lib/auth/session');
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});

describe('credential validation', () => {
  it('rejects a password shorter than 10 characters', async () => {
    const { credentialsSchema } = await import('@/lib/auth/session');
    const result = credentialsSchema.safeParse({ email: 'a@b.com', password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', async () => {
    const { credentialsSchema } = await import('@/lib/auth/session');
    const result = credentialsSchema.safeParse({ email: 'not-an-email', password: 'longenoughpassword' });
    expect(result.success).toBe(false);
  });

  it('lower-cases and trims the email', async () => {
    const { credentialsSchema } = await import('@/lib/auth/session');
    const result = credentialsSchema.safeParse({ email: '  User@Example.com  ', password: 'longenoughpassword' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('user@example.com');
  });

  it('registerSchema requires a display name and defaults the timezone', async () => {
    const { registerSchema } = await import('@/lib/auth/session');
    const result = registerSchema.safeParse({
      email: 'a@b.com',
      password: 'longenoughpassword',
      displayName: 'Alex',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.timezone).toBe('UTC');
  });
});

describe('token encryption', () => {
  it('round-trips a secret through encryptSecret/decryptSecret', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/auth/crypto');
    const plaintext = 'ya29.some-oauth-access-token';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', async () => {
    const { encryptSecret } = await import('@/lib/auth/crypto');
    const a = encryptSecret('same-token');
    const b = encryptSecret('same-token');
    expect(a).not.toBe(b);
  });

  it('rejects a tampered ciphertext instead of silently returning garbage', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/auth/crypto');
    const encrypted = encryptSecret('token-value');
    const parts = encrypted.split('.');
    parts[3] = parts[3].slice(0, -2) + 'zz';
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('hashToken is deterministic for the same input', async () => {
    const { hashToken } = await import('@/lib/auth/crypto');
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('safeEqual compares strings correctly regardless of length mismatch', async () => {
    const { safeEqual } = await import('@/lib/auth/crypto');
    expect(safeEqual('same', 'same')).toBe(true);
    expect(safeEqual('same', 'diff')).toBe(false);
    expect(safeEqual('short', 'longer-string')).toBe(false);
  });
});
