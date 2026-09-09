import { NextResponse, type NextRequest } from 'next/server';
import { prisma, isDatabaseConfigured } from '@/lib/db/prisma';
import { createSession, credentialsSchema, setSessionCookie, verifyPassword } from '@/lib/auth/session';
import { logger } from '@/lib/util/logger';

/** POST /api/auth/login - email + password only. Platform credentials are never involved. */
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

  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  // Same generic message whether the email or the password was wrong, so the
  // response never confirms which accounts exist.
  const invalid = () => NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return invalid();
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return invalid();

    const token = await createSession(user.id, request.headers.get('user-agent'));
    await setSessionCookie(token);

    logger.info('auth.login', { userId: user.id });
    return NextResponse.json({ id: user.id, email: user.email, displayName: user.displayName });
  } catch (error) {
    logger.error('auth.login_failed', { error });
    return NextResponse.json(
      { error: 'Could not reach the database. Check that PostgreSQL is running and DATABASE_URL is correct.' },
      { status: 503 },
    );
  }
}
