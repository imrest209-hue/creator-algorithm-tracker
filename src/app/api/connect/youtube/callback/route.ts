import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { youtubeIntegration } from '@/lib/integrations/youtube';
import { callbackUrl } from '@/lib/integrations/registry';
import { oauthStateCookieName } from '@/lib/integrations/oauth-state';
import { encryptSecret, safeEqual } from '@/lib/auth/crypto';
import { ApiError } from '@/lib/integrations/http';
import { upsertVideo } from '@/lib/videos/persist';
import { logger } from '@/lib/util/logger';

/**
 * GET /api/connect/youtube/callback
 * Completes the OAuth handshake, stores the encrypted tokens, and runs an
 * initial sync so the account has data immediately.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const settingsUrl = new URL('/settings', request.url);

  const error = request.nextUrl.searchParams.get('error');
  if (error) {
    settingsUrl.searchParams.set('error', 'YouTube authorization was cancelled or denied.');
    return NextResponse.redirect(settingsUrl);
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const store = await cookies();
  const expectedState = store.get(oauthStateCookieName('youtube'))?.value;
  store.delete(oauthStateCookieName('youtube'));

  if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
    settingsUrl.searchParams.set('error', 'Invalid or expired authorization request. Try connecting again.');
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const redirectUri = callbackUrl('YOUTUBE', request.nextUrl.origin);
    const tokens = await youtubeIntegration.exchangeCode(code, redirectUri);
    const profile = await youtubeIntegration.fetchProfile(tokens);

    const account = await prisma.connectedAccount.upsert({
      where: {
        userId_platform_externalId: { userId: user.id, platform: 'YOUTUBE', externalId: profile.externalId },
      },
      update: {
        accountName: profile.accountName,
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        status: 'CONNECTED',
        statusMessage: null,
        lastSyncedAt: new Date(),
      },
      create: {
        userId: user.id,
        platform: 'YOUTUBE',
        externalId: profile.externalId,
        accountName: profile.accountName,
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        status: 'CONNECTED',
      },
    });

    const sync = await youtubeIntegration.fetchVideos(tokens, { limit: 100 });
    let imported = 0;
    for (const video of sync.videos) {
      await upsertVideo(
        user.id,
        {
          platform: video.platform,
          platformVideoId: video.platformVideoId,
          title: video.title,
          caption: video.caption,
          description: video.description,
          hashtags: video.hashtags,
          durationSeconds: video.durationSeconds,
          publishedAt: video.publishedAt,
          views: video.metrics.views,
          likes: video.metrics.likes,
          comments: video.metrics.comments,
          shares: video.metrics.shares,
          saves: video.metrics.saves,
          followersGained: video.metrics.followersGained,
          watchTimeMinutes: video.metrics.watchTimeMinutes,
          averageViewDurationSeconds: video.metrics.averageViewDurationSeconds,
          averagePercentageViewed: video.metrics.averagePercentageViewed,
          impressions: video.metrics.impressions,
          clickThroughRate: video.metrics.clickThroughRate,
        },
        'YOUTUBE_API',
        account.id,
      );
      imported += 1;
    }

    logger.info('youtube.connected', { userId: user.id, imported, warnings: sync.warnings.length });
    settingsUrl.searchParams.set('connected', 'youtube');
    settingsUrl.searchParams.set('imported', String(imported));
    if (sync.warnings.length > 0) settingsUrl.searchParams.set('warning', sync.warnings[0]);
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    const message = err instanceof ApiError ? err.userMessage : 'Could not connect to YouTube.';
    logger.error('youtube.connect_failed', { error: err, userId: user.id });
    settingsUrl.searchParams.set('error', message);
    return NextResponse.redirect(settingsUrl);
  }
}
