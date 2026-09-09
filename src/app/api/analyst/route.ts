import { NextResponse, type NextRequest } from 'next/server';
import { getViewer } from '@/lib/data/viewer';
import { applyFilter, parseFilter } from '@/lib/analytics/filter';
import { answerQuestion } from '@/lib/analytics/analyst';

/**
 * POST /api/analyst
 * Body: { question: string }. Query params carry the same range/platform
 * filter as the rest of the dashboard, so "why did my last video perform
 * well" answers about the videos currently in view.
 *
 * This runs entirely locally against stored metrics - there is no call to a
 * hosted LLM, and the answer can only cite numbers this app actually stores.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const question = typeof (body as { question?: unknown })?.question === 'string'
    ? (body as { question: string }).question.slice(0, 500)
    : '';
  if (!question.trim()) {
    return NextResponse.json({ error: 'Provide a question to ask.' }, { status: 400 });
  }

  const viewer = await getViewer();
  const filter = parseFilter(Object.fromEntries(request.nextUrl.searchParams));
  const set = applyFilter(viewer.dataset.videos, filter);

  const answer = answerQuestion(question, {
    videos: set.platformVideos,
    timezone: viewer.dataset.timezone,
  });

  return NextResponse.json(answer);
}
