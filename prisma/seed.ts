/**
 * Database seed script.
 *
 * Creates ONE demo user (demo@example.com / demo12345678) whose account is
 * populated with the same synthetic generator used for unauthenticated demo
 * mode, so `npm run db:seed` gives you something to sign into and click
 * around in without connecting a real platform.
 *
 * This is separate from the in-memory demo mode shown to signed-out visitors:
 * that mode never touches the database at all. This script is only for
 * developers who want seeded rows in Postgres.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateDemoVideos, DEMO_TIMEZONE } from '../src/lib/demo/generator';
import { classifyCategory, DEFAULT_CATEGORIES } from '../src/lib/analytics/content';

const prisma = new PrismaClient();

const SEED_EMAIL = 'demo@example.com';
const SEED_PASSWORD = 'demo12345678';

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: SEED_EMAIL },
    update: {},
    create: {
      email: SEED_EMAIL,
      passwordHash,
      displayName: 'Demo Creator',
      timezone: DEMO_TIMEZONE,
    },
  });

  const categoryBySlug = new Map<string, string>();
  for (const cat of DEFAULT_CATEGORIES) {
    const row = await prisma.contentCategory.upsert({
      where: { userId_slug: { userId: user.id, slug: cat.slug } },
      update: {},
      create: { userId: user.id, slug: cat.slug, name: cat.name, keywords: cat.keywords, isCustom: false },
    });
    categoryBySlug.set(cat.slug, row.id);
  }

  const videos = generateDemoVideos({ count: 50 });
  let created = 0;

  for (const video of videos) {
    const classification = classifyCategory(video, DEFAULT_CATEGORIES);
    const categoryId = categoryBySlug.get(classification.slug);

    const row = await prisma.video.upsert({
      where: {
        userId_platform_platformVideoId: {
          userId: user.id,
          platform: video.platform,
          platformVideoId: video.platformVideoId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        platform: video.platform,
        platformVideoId: video.platformVideoId,
        title: video.title,
        caption: video.caption,
        description: video.description,
        categoryId,
        categoryAuto: true,
        durationSeconds: video.durationSeconds,
        publishedAt: new Date(video.publishedAt),
        source: 'DEMO',
      },
    });

    await prisma.videoMetric.create({
      data: {
        videoId: row.id,
        views: BigInt(video.metrics.views),
        likes: BigInt(video.metrics.likes),
        comments: BigInt(video.metrics.comments),
        shares: BigInt(video.metrics.shares),
        saves: video.metrics.saves === null ? null : BigInt(video.metrics.saves),
        followersGained: video.metrics.followersGained,
        watchTimeMinutes: video.metrics.watchTimeMinutes,
        averageViewDurationSeconds: video.metrics.averageViewDurationSeconds,
        averagePercentageViewed: video.metrics.averagePercentageViewed,
        impressions: video.metrics.impressions === null ? null : BigInt(video.metrics.impressions),
        clickThroughRate: video.metrics.clickThroughRate,
        source: 'DEMO',
      },
    });

    if (video.hookText) {
      await prisma.hook.upsert({
        where: { videoId: row.id },
        update: {},
        create: { videoId: row.id, text: video.hookText, type: video.hookType, isAuto: true },
      });
    }

    for (const raw of video.hashtags) {
      const tag = raw.replace(/^#+/, '').toLowerCase();
      if (!tag) continue;
      const hashtag = await prisma.hashtag.upsert({ where: { tag }, update: {}, create: { tag } });
      await prisma.videoHashtag
        .create({ data: { videoId: row.id, hashtagId: hashtag.id } })
        .catch(() => undefined);
    }

    for (const snap of video.snapshots) {
      await prisma.velocitySnapshot
        .create({
          data: {
            videoId: row.id,
            minutesAfterPublish: snap.minutesAfterPublish,
            views: BigInt(snap.views),
            likes: snap.likes === null ? null : BigInt(snap.likes),
            comments: snap.comments === null ? null : BigInt(snap.comments),
            shares: snap.shares === null ? null : BigInt(snap.shares),
          },
        })
        .catch(() => undefined);
    }

    created += 1;
  }

  console.log(`Seeded ${created} videos for ${SEED_EMAIL} (password: ${SEED_PASSWORD}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
