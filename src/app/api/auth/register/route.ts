import { NextResponse, type NextRequest } from 'next/server';
import { prisma, isDatabaseConfigured } from '@/lib/db/prisma';
import { createSession, hashPassword, registerSchema, setSessionCookie } from '@/lib/auth/session';
import { logger } from '@/lib/util/logger';

/**
 * POST /api/auth/register
 * Creates a user with a bcrypt-hashed password and starts a session.
 * Platform (YouTube/TikTok) credentials are never collected here - only the
 * app's own email/password.
 */
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'Accounts require a configured PostgreSQL database. See the README for setup.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  const { email, password, displayName, timezone } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName, timezone },
    });

    logger.info('auth.register', { userId: user.id });

    const token = await createSession(user.id, request.headers.get('user-agent'));
    await setSessionCookie(token);

    return NextResponse.json({ id: user.id, email: user.email, displayName: user.displayName });
  } catch (error) {
    logger.error('auth.register_failed', { error });
    return NextResponse.json(
      { error: 'Could not reach the database. Check that PostgreSQL is running and DATABASE_URL is correct.' },
      { status: 503 },
    );
  }
}
