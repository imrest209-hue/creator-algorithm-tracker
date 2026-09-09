import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { tiktokIntegration } from '@/lib/integrations/tiktok';
import { callbackUrl, requestOrigin } from '@/lib/integrations/registry';
import { oauthStateCookieName, pkceVerifierCookieName } from '@/lib/integrations/oauth-state';
import { encryptSecret, safeEqual } from '@/lib/auth/crypto';
import { ApiError } from '@/lib/integrations/http';
import { importAccountVideos } from '@/lib/integrations/sync';
import { logger } from '@/lib/util/logger';

/**
 * GET /api/connect/tiktok/callback
 * Same shape as the YouTube callback. TikTok's Display API cannot supply
 * retention, watch time, saves, impressions, CTR or follower attribution -
 * those come back as `null` from the integration and are stored as such.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/login', requestOrigin(request)));

  const settingsUrl = new URL('/settings', requestOrigin(request));

  const error = request.nextUrl.searchParams.get('error');
  if (error) {
    settingsUrl.searchParams.set('error', 'TikTok authorization was cancelled or denied.');
    return NextResponse.redirect(settingsUrl);
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const store = await cookies();
  const expectedState = store.get(oauthStateCookieName('tiktok'))?.value;
  const codeVerifier = store.get(pkceVerifierCookieName('tiktok'))?.value;
  store.delete(oauthStateCookieName('tiktok'));
  store.delete(pkceVerifierCookieName('tiktok'));

  if (!code || !state || !expectedState || !safeEqual(state, expectedState) || !codeVerifier) {
    settingsUrl.searchParams.set('error', 'Invalid or expired authorization request. Try connecting again.');
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const redirectUri = callbackUrl('TIKTOK', requestOrigin(request));
    const tokens = await tiktokIntegration.exchangeCode(code, redirectUri, codeVerifier);
    const profile = await tiktokIntegration.fetchProfile(tokens);

    const account = await prisma.connectedAccount.upsert({
      where: {
        userId_platform_externalId: { userId: user.id, platform: 'TIKTOK', externalId: profile.externalId },
      },
      update: {
        accountName: profile.accountName,
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        status: 'CONNECTED',
        statusMessage: null,
      },
      create: {
        userId: user.id,
        platform: 'TIKTOK',
        externalId: profile.externalId,
        accountName: profile.accountName,
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        status: 'CONNECTED',
      },
    });

    const sync = await importAccountVideos(account, tiktokIntegration, tokens);
    const imported = sync.imported;

    logger.info('tiktok.connected', { userId: user.id, imported });
    settingsUrl.searchParams.set('connected', 'tiktok');
    settingsUrl.searchParams.set('imported', String(imported));
    if (sync.warnings.length > 0) settingsUrl.searchParams.set('warning', sync.warnings[0]);
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    const message = err instanceof ApiError ? err.userMessage : 'Could not connect to TikTok.';
    logger.error('tiktok.connect_failed', { error: err, userId: user.id });
    settingsUrl.searchParams.set('error', message);
    return NextResponse.redirect(settingsUrl);
  }
}
