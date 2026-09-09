/**
 * OLLAMA CLIENT
 * ---------------------------------------------------------------------------
 * The research assistant's optional local-model backend. Ollama is fully open
 * source, runs entirely on this machine, and needs no API key or paid account
 * - which is the whole point: the assistant must never require per-request
 * billing to work.
 *
 * Everything here degrades gracefully. If Ollama isn't installed or isn't
 * running, `isAvailable()` returns false and the assistant falls back to
 * showing real search results instead of a generated answer. It never
 * pretends to have reasoned about something it couldn't.
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
const PROBE_TIMEOUT_MS = 1_500;
const GENERATE_TIMEOUT_MS = 120_000;

export interface OllamaStatus {
  available: boolean;
  models: string[];
  host: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Cheap probe used by the UI to show whether local AI is switched on. */
export async function getOllamaStatus(): Promise<OllamaStatus> {
  const response = await fetchWithTimeout(OLLAMA_HOST + '/api/tags', { method: 'GET' }, PROBE_TIMEOUT_MS);
  if (!response || !response.ok) return { available: false, models: [], host: OLLAMA_HOST };
  try {
    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? []).map((m) => m.name).filter((n): n is string => Boolean(n));
    return { available: models.length > 0, models, host: OLLAMA_HOST };
  } catch {
    return { available: false, models: [], host: OLLAMA_HOST };
  }
}

/**
 * Picks a sensible default model: prefer whatever the user set via
 * OLLAMA_MODEL, then a small instruct-tuned model, then just the first one
 * installed. Never downloads anything - only uses what's already there.
 */
export function pickModel(models: string[]): string | null {
  if (models.length === 0) return null;
  const preferred = process.env.OLLAMA_MODEL;
  if (preferred && models.includes(preferred)) return preferred;
  const ranked = ['llama3.2', 'llama3.1', 'qwen2.5', 'mistral', 'phi3', 'gemma2'];
  for (const name of ranked) {
    const match = models.find((m) => m.toLowerCase().startsWith(name));
    if (match) return match;
  }
  return models[0];
}

export async function generate(model: string, prompt: string): Promise<string | null> {
  const response = await fetchWithTimeout(
    OLLAMA_HOST + '/api/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.2, num_predict: 700 },
      }),
    },
    GENERATE_TIMEOUT_MS,
  );
  if (!response || !response.ok) return null;
  try {
    const data = (await response.json()) as { response?: string };
    const text = (data.response ?? '').trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
