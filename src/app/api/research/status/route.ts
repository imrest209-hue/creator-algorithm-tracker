import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getOllamaStatus, pickModel } from '@/lib/ai/ollama';

/** GET /api/research/status - whether a local model is available, and which. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to use the research assistant.' }, { status: 401 });
  }

  const status = await getOllamaStatus();
  return NextResponse.json({
    available: status.available,
    models: status.models,
    selectedModel: pickModel(status.models),
    host: status.host,
  });
}
