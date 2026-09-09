import { z } from 'zod';
import { PLATFORMS } from '@/lib/types';

/**
 * Validation for manually-entered / API-submitted video data.
 * Shared between the manual-add form's client-side checks and the server route.
 */
export const manualVideoSchema = z.object({
  platform: z.enum(PLATFORMS),
  platformVideoId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(300),
  caption: z.string().trim().max(2200).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  hashtags: z.array(z.string().trim().max(60)).max(30).default([]),
  categorySlug: z.string().trim().max(60).optional(),
  categoryName: z.string().trim().max(60).optional(),
  hookText: z.string().trim().max(500).optional().nullable(),
  durationSeconds: z.number().int().positive().max(6 * 60 * 60),
  publishedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .refine((value) => Number.isFinite(Date.parse(value)), 'Enter a valid publish date.'),
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative().default(0),
  comments: z.number().int().nonnegative().default(0),
  shares: z.number().int().nonnegative().default(0),
  saves: z.number().int().nonnegative().nullable().optional(),
  followersGained: z.number().int().nullable().optional(),
  watchTimeMinutes: z.number().nonnegative().nullable().optional(),
  averageViewDurationSeconds: z.number().nonnegative().nullable().optional(),
  averagePercentageViewed: z.number().min(0).max(100).nullable().optional(),
  impressions: z.number().int().nonnegative().nullable().optional(),
  clickThroughRate: z.number().min(0).max(100).nullable().optional(),
});

export type ManualVideoInput = z.infer<typeof manualVideoSchema>;
