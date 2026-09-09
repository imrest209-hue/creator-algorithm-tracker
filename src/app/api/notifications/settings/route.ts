import { NextResponse, type NextRequest } from 'next/server';
import { NOTIFICATION_TYPES } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

/** PUT /api/notifications/settings - toggles one notification type on/off. */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const type = body?.type;
  const enabled = body?.enabled;
  if (!NOTIFICATION_TYPES.includes(type) || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid notification type or enabled flag.' }, { status: 400 });
  }

  await prisma.notificationSetting.upsert({
    where: { userId_type: { userId: user.id, type } },
    update: { enabled },
    create: { userId: user.id, type, enabled },
  });

  return NextResponse.json({ ok: true });
}
