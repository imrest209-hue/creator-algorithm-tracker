import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { syncConnectedAccount } from '@/lib/integrations/sync';
import { ApiError } from '@/lib/integrations/http';
import { logger } from '@/lib/util/logger';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.accountId !== 'string' || !body.accountId) {
    return NextResponse.json({ error: 'Missing accountId.' }, { status: 400 });
  }
  const account = await prisma.connectedAccount.findFirst({ where: { id: body.accountId, userId: user.id } });
  if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  try {
    return NextResponse.json(await syncConnectedAccount(account));
  } catch (error) {
    logger.error('account.sync_failed', { accountId: account.id, error });
    return NextResponse.json({
      error: error instanceof ApiError ? error.userMessage : 'Sync did not finish. Please try again.',
    }, { status: 502 });
  }
}
