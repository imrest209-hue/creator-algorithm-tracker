import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { DEMO_COOKIE } from '@/lib/data/viewer';
import { requestOrigin } from '@/lib/integrations/registry';

/** Turns off demo preview for a signed-in user, returning them to their own data. */
export async function POST(request: NextRequest) {
  const store = await cookies();
  store.delete(DEMO_COOKIE);
  const origin = requestOrigin(request);
  const referer = request.headers.get('referer');
  const target = referer && referer.startsWith(origin) ? referer : '/dashboard';
  return NextResponse.redirect(new URL(target, origin), { status: 303 });
}
