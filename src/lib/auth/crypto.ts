import crypto from 'node:crypto';

/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 *
 * Platform passwords are never handled by this app at all - only OAuth access
 * and refresh tokens, and those are encrypted before they touch the database so
 * a database dump alone does not expose account access.
 *
 * APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class EncryptionKeyError extends Error {}

function loadKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new EncryptionKeyError(
      'APP_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new EncryptionKeyError(
      'APP_ENCRYPTION_KEY must decode to exactly 32 bytes (got ' + key.length + ').',
    );
  }
  return key;
}

export function isEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/** Returns "v1.<iv>.<authTag>.<ciphertext>", all base64url. */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string): string {
  const key = loadKey();
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Encrypted payload is malformed or uses an unsupported version.');
  }
  const [, ivPart, tagPart, dataPart] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Opaque session tokens are stored only as a SHA-256 hash. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Constant-time string comparison for CSRF/state values. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * PKCE (RFC 7636) code_challenge derived from a code_verifier via S256.
 * `randomToken()` already produces a base64url string in the 43-128 char
 * range that only uses unreserved characters, so it doubles as a valid
 * code_verifier - generate one with randomToken() and pass it here.
 */
export function pkceCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}
