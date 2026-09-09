import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getOllamaStatus, pickModel, warmModel } from '@/lib/ai/ollama';

/**
 * GET /api/research/status - whether a local model is available, and which.
 *
 * The research page calls this on mount, which makes it the natural place to
 * start preloading the model: loading is by far the slowest part of answering
 * (see the note in ollama.ts), and it can happen while the user is still typing.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to use the research assistant.' }, { status: 401 });
  }

  const status = await getOllamaStatus();
  const selectedModel = pickModel(status.models);

  // Fire-and-forget: never make the caller wait on the load.
  if (selectedModel) void warmModel(selectedModel).catch(() => undefined);

  return NextResponse.json({
    available: status.available,
    models: status.models,
    selectedModel,
    host: status.host,
  });
}
