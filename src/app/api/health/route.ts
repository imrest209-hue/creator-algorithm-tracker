import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ app: 'creator-algorithm-tracker', status: 'ok' });
}
