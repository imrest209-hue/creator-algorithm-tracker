'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SUGGESTED_QUESTIONS, type AnalystIntent } from '@/lib/analytics/analyst';
import { Alert, Badge, Card, SectionHeading } from '@/components/ui/primitives';

interface AnswerPayload {
  intent: AnalystIntent;
  question: string;
  headline: string;
  points: string[];
  referencedVideoIds: string[];
  insufficientData: boolean;
}

/**
 * Client-side Q&A panel. Calls /api/analyst so the answer is always computed
 * server-side from the real dataset - nothing here is a hosted LLM call, and
 * every answer is built entirely from this session's stored metrics.
 */
export function AnalystPanel({ query }: { query: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AnswerPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/analyst?' + query, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Could not answer that question.');
        setLoading(false);
        return;
      }
      setAnswer(data);
      setQuestion(text);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <SectionHeading
        title="Ask about your data"
        description="Answers are generated from your own stored metrics only - no external model, nothing fabricated."
        action={<Badge tone="warn">AI-GENERATED ANALYSIS</Badge>}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Why are my views declining?"
          className="input"
        />
        <button type="submit" disabled={loading} className="btn-primary whitespace-nowrap">
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => ask(q.label)}
            className="rounded-full border border-base-700 bg-base-800 px-2.5 py-1 text-xs text-ink-muted hover:bg-base-750 hover:text-ink"
          >
            {q.label}
          </button>
        ))}
      </div>

      {error ? (
        <Alert tone="bad" className="mt-3">
          {error}
        </Alert>
      ) : null}

      {answer ? (
        <div className="mt-4 rounded-lg border border-base-800 bg-base-900/50 p-3">
          <p className="text-xs text-ink-muted">&ldquo;{answer.question}&rdquo;</p>
          <p className="mt-1 text-sm font-medium text-ink">{answer.headline}</p>
          <ul className="mt-2 space-y-1.5">
            {answer.points.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink-muted">
                <span aria-hidden className="text-brand-400">
                  •
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          {answer.referencedVideoIds.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {answer.referencedVideoIds.slice(0, 5).map((id) => (
                <Link
                  key={id}
                  href={'/videos/' + id}
                  className="rounded-md border border-base-700 px-2 py-0.5 text-xs text-brand-300 hover:bg-base-800"
                >
                  View video →
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
