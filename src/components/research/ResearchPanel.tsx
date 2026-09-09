'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Card, SectionHeading, Alert, Badge, EmptyState } from '@/components/ui/primitives';
import { IconSparkles, IconAlertCircle, IconLink, IconCheckCircle } from '@/components/studio/icons';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'duckduckgo' | 'wikipedia';
}

interface AssistantAnswer {
  answer: string | null;
  sources: SearchResult[];
  engine: string;
  note: string | null;
}

interface Status {
  available: boolean;
  models: string[];
  selectedModel: string | null;
}

const SUGGESTIONS = [
  'What are the best upload times for gaming channels in 2026?',
  'How does the YouTube Shorts algorithm surface new creators?',
  'What thumbnail styles perform best for Call of Duty content?',
  'Current Warzone meta loadouts this season',
];

export function ResearchPanel() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssistantAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/research/status')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && !data.error) setStatus(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/research/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'The search failed.');
        return;
      }
      setResult(data);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeading
          title="Ask a question"
          description="Searches the open web, then summarises what it finds using a model running on this machine."
          action={
            status ? (
              status.available ? (
                <Badge tone="good" title={'Local model: ' + (status.selectedModel ?? 'unknown')}>
                  Local AI on
                </Badge>
              ) : (
                <Badge tone="neutral" title="No local model detected - results are shown unsummarised">
                  Search only
                </Badge>
              )
            ) : null
          }
        />

        <form onSubmit={ask} className="space-y-3">
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            placeholder="e.g. What's driving Shorts reach for gaming channels right now?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn-primary" disabled={loading || !question.trim()}>
              <IconSparkles width={15} height={15} />
              {loading ? 'Searching…' : 'Search the web'}
            </button>
            {loading ? <span className="text-xs text-ink-muted">Fetching sources…</span> : null}
          </div>
        </form>

        {!result && !loading ? (
          <div className="mt-4">
            <p className="label mb-1.5">Try one of these</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="rounded-full border border-base-700 bg-base-900 px-3 py-1 text-xs text-ink-muted transition-colors hover:border-brand-500/40 hover:text-ink"
                  onClick={() => setQuestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {error ? (
        <Alert tone="bad">
          <span className="inline-flex items-center gap-1.5">
            <IconAlertCircle width={14} height={14} /> {error}
          </span>
        </Alert>
      ) : null}

      {result ? (
        <>
          {result.answer ? (
            <Card>
              <SectionHeading
                title="Answer"
                action={<Badge tone="brand">{result.engine.replace('ollama:', 'Local · ')}</Badge>}
              />
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{result.answer}</div>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-muted">
                <IconCheckCircle width={13} height={13} className="mt-0.5 shrink-0" />
                <span>
                  Generated from the sources below by a model running locally. It reflects what those pages say —
                  it is not measured data from your channel, and nothing here touches your analytics.
                </span>
              </p>
            </Card>
          ) : null}

          {result.note ? <Alert tone="info">{result.note}</Alert> : null}

          <Card>
            <SectionHeading title="Sources" description={result.sources.length + ' results from the open web.'} />
            {result.sources.length === 0 ? (
              <EmptyState title="No sources" description="Nothing came back for that search." />
            ) : (
              <ol className="space-y-3">
                {result.sources.map((source, index) => (
                  <li key={source.url} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-base-800 text-[11px] font-semibold text-ink-muted">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="link inline-flex items-center gap-1 text-sm font-medium"
                      >
                        {source.title}
                        <IconLink width={12} height={12} />
                      </a>
                      <p className="truncate text-[11px] text-base-600">{source.url}</p>
                      {source.snippet ? (
                        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{source.snippet}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
