import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/session';
import { getIntegration, callbackUrl } from '@/lib/integrations/registry';
import { oauthStateCookieName } from '@/lib/integrations/oauth-state';
import { randomToken } from '@/lib/auth/crypto';
import type { Platform } from '@/lib/types';

/**
 * GET /api/connect/[platform]
 * Starts the OAuth flow: stores a random state value in an httpOnly cookie
 * (checked on callback to prevent CSRF) and redirects to the platform.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { platform: platformParam } = await params;
  const platform: Platform =
    platformParam === 'tiktok' ? 'TIKTOK' : platformParam === 'twitch' ? 'TWITCH' : 'YOUTUBE';
  const integration = getIntegration(platform);
  if (!integration) {
    return NextResponse.json({ error: 'Unknown platform.' }, { status: 404 });
  }
  if (!integration.isConfigured()) {
    return NextResponse.json(
      {
        error:
          integration.label +
          ' is not configured on this server. Missing: ' +
          integration.requiredEnvVars.join(', '),
      },
      { status: 503 },
    );
  }

  const state = randomToken(24);
  const store = await cookies();
  store.set(oauthStateCookieName(platformParam), state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  const redirectUri = callbackUrl(platform, request.nextUrl.origin);
  const authorizationUrl = integration.buildAuthorizationUrl(state, redirectUri);
  return NextResponse.redirect(authorizationUrl);
}
