import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { PLATFORMS } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/util/logger';

const createSchema = z.object({
  platform: z.enum(PLATFORMS),
  handle: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(500).optional().nullable(),
  displayName: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/**
 * POST /api/competitors
 * Manually registers a reference creator. This app does not scrape private
 * data or bypass platform restrictions - it only stores what the user enters,
 * or (in the future) what an official API returns for a public handle.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in to track reference creators.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }

  try {
    const competitor = await prisma.competitorAccount.create({
      data: {
        userId: user.id,
        platform: parsed.data.platform,
        handle: parsed.data.handle.replace(/^@/, ''),
        url: parsed.data.url ?? null,
        displayName: parsed.data.displayName ?? null,
        notes: parsed.data.notes ?? null,
        dataSource: 'MANUAL',
      },
    });
    return NextResponse.json(competitor, { status: 201 });
  } catch (error) {
    logger.error('competitor.create_failed', { error, userId: user.id });
    return NextResponse.json({ error: 'Could not save this creator (it may already be tracked).' }, { status: 400 });
  }
}
