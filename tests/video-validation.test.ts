import { expect, it } from 'vitest';
import { manualVideoSchema } from '@/lib/videos/schema';
const video = { platform: 'YOUTUBE', platformVideoId: 'id', title: 'Video', durationSeconds: 10, views: 100 };
it('rejects long invalid dates before they reach the database', () => {
  for (const publishedAt of ['this-is-not-a-date', '2026-99-99', '2026-01-01junk']) {
    expect(manualVideoSchema.safeParse({ ...video, publishedAt }).success).toBe(false);
  }
});
it('accepts date-only imports and timestamps with offsets', () => {
  for (const publishedAt of ['2026-09-09', '2026-09-09T09:00:00-06:00']) {
    expect(manualVideoSchema.safeParse({ ...video, publishedAt }).success).toBe(true);
  }
});
