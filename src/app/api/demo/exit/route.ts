import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { DEMO_COOKIE } from '@/lib/data/viewer';

/** Turns off demo preview for a signed-in user, returning them to their own data. */
export async function POST(request: NextRequest) {
  const store = await cookies();
  store.delete(DEMO_COOKIE);
  const referer = request.headers.get('referer');
  const target = referer && referer.startsWith(request.nextUrl.origin) ? referer : '/dashboard';
  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
