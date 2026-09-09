import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/util/logger';

/**
 * POST /api/connect/disconnect
 * Removes a connected account's stored (encrypted) tokens. Videos already
 * imported from that account are kept - disconnecting stops future syncs, it
 * does not delete history.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const accountId = typeof body?.accountId === 'string' ? body.accountId : null;
  if (!accountId) return NextResponse.json({ error: 'Missing accountId.' }, { status: 400 });

  const account = await prisma.connectedAccount.findUnique({ where: { id: accountId } });
  if (!account || account.userId !== user.id) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  await prisma.connectedAccount.delete({ where: { id: accountId } });
  logger.info('account.disconnected', { userId: user.id, platform: account.platform });

  return NextResponse.json({ ok: true });
}
