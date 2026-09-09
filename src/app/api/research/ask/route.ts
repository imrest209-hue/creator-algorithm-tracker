import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { askAssistant } from '@/lib/ai/assistant';
import { logger } from '@/lib/util/logger';

/**
 * POST /api/research/ask - searches the web for a question and, when a local
 * model is available, summarises the findings. The question and the sources
 * used are stored so an answer stays reviewable later.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to use the research assistant.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return NextResponse.json({ error: 'Enter a question.' }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: 'Keep the question under 500 characters.' }, { status: 400 });
  }

  try {
    const result = await askAssistant(question);

    await prisma.researchQuery.create({
      data: {
        userId: user.id,
        question,
        answer: result.answer,
        sources: result.sources as unknown as object,
        engine: result.engine,
      },
    });

    logger.info('research.answered', {
      userId: user.id,
      engine: result.engine,
      sources: result.sources.length,
      generated: Boolean(result.answer),
    });
    return NextResponse.json(result);
  } catch (error) {
    logger.error('research.ask_failed', { error, userId: user.id });
    return NextResponse.json(
      { error: 'The research assistant could not complete that search. Check server logs.' },
      { status: 500 },
    );
  }
}
