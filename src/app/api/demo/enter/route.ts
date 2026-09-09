import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { DEMO_COOKIE } from '@/lib/data/viewer';
import { requestOrigin } from '@/lib/integrations/registry';

/** Lets a signed-in user preview the synthetic demo dataset without losing their own data. */
export async function POST(request: NextRequest) {
  const store = await cookies();
  store.set(DEMO_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 3600, // 1 hour - a deliberately short preview, not a persistent mode switch
  });
  const origin = requestOrigin(request);
  const referer = request.headers.get('referer');
  const target = referer && referer.startsWith(origin) ? referer : '/dashboard';
  return NextResponse.redirect(new URL(target, origin), { status: 303 });
}
