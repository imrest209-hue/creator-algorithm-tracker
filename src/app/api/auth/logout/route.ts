import { NextResponse, type NextRequest } from 'next/server';
import { clearSessionCookie, destroyCurrentSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  await destroyCurrentSession();
  await clearSessionCookie();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
