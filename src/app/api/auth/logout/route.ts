import { NextResponse, type NextRequest } from 'next/server';
import { clearSessionCookie, destroyCurrentSession } from '@/lib/auth/session';
import { requestOrigin } from '@/lib/integrations/registry';

export async function POST(request: NextRequest) {
  await destroyCurrentSession();
  await clearSessionCookie();
  return NextResponse.redirect(new URL('/login', requestOrigin(request)), { status: 303 });
}
