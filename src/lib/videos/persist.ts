import type { DataSource } from '@/lib/types';
import { prisma } from '@/lib/db/prisma';
import { classifyCategory, DEFAULT_CATEGORIES, normaliseHashtag } from '@/lib/analytics/content';
import { classifyHook } from '@/lib/analytics/hooks';
import { slugify } from '@/lib/csv/import';
import type { ManualVideoInput } from '@/lib/videos/schema';

/**
 * Upserts one video (manual entry, CSV row, or API sync result) plus its
 * category, hook, hashtags and a fresh metrics snapshot.
 *
 * Metrics are always appended as a new `VideoMetric` row rather than mutated in
 * place, so a video's metric history is preserved for growth charts.
 */
export async function upsertVideo(
  userId: string,
  input: ManualVideoInput,
  source: DataSource,
  connectedAccountId?: string | null,
): Promise<{ id: string; created: boolean }> {
  const classification = input.categoryName
    ? { slug: input.categorySlug ?? slugify(input.categoryName), name: input.categoryName }
    : classifyCategory(
        {
          title: input.title,
          caption: input.caption ?? null,
          description: input.description ?? null,
          hashtags: input.hashtags,
        },
        DEFAULT_CATEGORIES,
      );

  const category = await prisma.contentCategory.upsert({
    where: { userId_slug: { userId, slug: classification.slug } },
    update: {},
    create: {
      userId,
      slug: classification.slug,
      name: classification.name,
      isCustom: !DEFAULT_CATEGORIES.some((c) => c.slug === classification.slug),
    },
  });

  const existing = await prisma.video.findUnique({
    where: {
      userId_platform_platformVideoId: {
        userId,
        platform: input.platform,
        platformVideoId: input.platformVideoId,
      },
    },
  });

  const publishedAt = new Date(input.publishedAt);

  const video = await prisma.video.upsert({
    where: {
      userId_platform_platformVideoId: {
        userId,
        platform: input.platform,
        platformVideoId: input.platformVideoId,
      },
    },
    update: {
      title: input.title,
      caption: input.caption ?? null,
      description: input.description ?? null,
      categoryId: category.id,
      categoryAuto: !input.categoryName,
      durationSeconds: input.durationSeconds,
      publishedAt,
      source,
      connectedAccountId: connectedAccountId ?? undefined,
    },
    create: {
      userId,
      platform: input.platform,
      platformVideoId: input.platformVideoId,
      title: input.title,
      caption: input.caption ?? null,
      description: input.description ?? null,
      categoryId: category.id,
      categoryAuto: !input.categoryName,
      durationSeconds: input.durationSeconds,
      publishedAt,
      source,
      connectedAccountId: connectedAccountId ?? undefined,
    },
  });

  await prisma.videoMetric.create({
    data: {
      videoId: video.id,
      views: BigInt(input.views),
      likes: BigInt(input.likes),
      comments: BigInt(input.comments),
      shares: BigInt(input.shares),
      saves: input.saves === null || input.saves === undefined ? null : BigInt(input.saves),
      followersGained: input.followersGained ?? null,
      watchTimeMinutes: input.watchTimeMinutes ?? null,
      averageViewDurationSeconds: input.averageViewDurationSeconds ?? null,
      averagePercentageViewed: input.averagePercentageViewed ?? null,
      impressions:
        input.impressions === null || input.impressions === undefined
          ? null
          : BigInt(input.impressions),
      clickThroughRate: input.clickThroughRate ?? null,
      source,
    },
  });

  if (input.hookText && input.hookText.trim().length > 0) {
    const hookText = input.hookText.trim();
    await prisma.hook.upsert({
      where: { videoId: video.id },
      update: { text: hookText, type: classifyHook(hookText), isAuto: true },
      create: { videoId: video.id, text: hookText, type: classifyHook(hookText), isAuto: true },
    });
  }

  if (input.hashtags.length > 0) {
    await prisma.videoHashtag.deleteMany({ where: { videoId: video.id } });
    for (const raw of input.hashtags) {
      const tag = normaliseHashtag(raw);
      if (!tag) continue;
      const hashtag = await prisma.hashtag.upsert({
        where: { tag },
        update: {},
        create: { tag },
      });
      await prisma.videoHashtag
        .create({ data: { videoId: video.id, hashtagId: hashtag.id } })
        .catch(() => undefined); // ignore races on the composite PK
    }
  }

  return { id: video.id, created: !existing };
}
