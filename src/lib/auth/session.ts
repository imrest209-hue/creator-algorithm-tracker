import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, isDatabaseConfigured } from '@/lib/db/prisma';
import { hashToken, randomToken } from '@/lib/auth/crypto';
import { logger } from '@/lib/util/logger';

/**
 * AUTHENTICATION
 * ---------------------------------------------------------------------------
 * Email + password with server-side sessions.
 *
 *  * Passwords are hashed with bcrypt (cost 12) and never logged.
 *  * Session tokens are random 32-byte values; only their SHA-256 hash is
 *    stored, so a leaked database cannot be replayed as a login.
 *  * The cookie is httpOnly + sameSite=lax, and Secure in production.
 *  * Platform (YouTube/TikTok) passwords are never collected - those accounts
 *    are connected through OAuth only.
 */

export const SESSION_COOKIE = 'cat_session';
const SESSION_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 12;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters.')
    .max(200, 'Password must be at most 200 characters.'),
});

export const registerSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1, 'Enter a display name.').max(80),
  timezone: z.string().trim().min(1).max(64).default('UTC'),
});

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Creates a session row and returns the raw token to put in the cookie. */
export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: userAgent?.slice(0, 255) ?? null,
    },
  });
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86_400,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Resolves the signed-in user, or null.
 *
 * Returns null (rather than throwing) when no database is configured, so the
 * app degrades to demo mode instead of erroring out.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  if (!isDatabaseConfigured()) return null;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    return {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      timezone: session.user.timezone,
    };
  } catch (error) {
    // A database that is configured but unreachable should not take down the
    // whole app - fall back to signed-out (demo) rendering.
    logger.error('auth.session_lookup_failed', { error });
    return null;
  }
}

export async function destroyCurrentSession(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await prisma.session
    .deleteMany({ where: { tokenHash: hashToken(token) } })
    .catch((error: unknown) => logger.warn('auth.session_delete_failed', { error }));
}

/** Removes expired sessions. Safe to call opportunistically. */
export async function pruneExpiredSessions(): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}
