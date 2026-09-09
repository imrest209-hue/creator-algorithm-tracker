import {
  VELOCITY_MILESTONES,
  type Dataset,
  type Platform,
  type VelocitySnapshot,
  type VideoRecord,
} from '@/lib/types';
import { DEFAULT_CATEGORIES, classifyCategory } from '@/lib/analytics/content';
import { classifyHook } from '@/lib/analytics/hooks';
import { clamp, round } from '@/lib/util/math';

/**
 * DEMO DATA GENERATOR
 * ---------------------------------------------------------------------------
 * Produces a realistic but entirely synthetic catalogue so the dashboard is
 * usable before any account is connected.
 *
 * Two hard rules:
 *  1. Every record is flagged `source: 'DEMO'` and the dataset carries
 *     `isDemo: true`, so demo data can never be mistaken for real analytics.
 *  2. Demo data is stored separately from real account data and is never
 *     merged into it (see `src/lib/data/provider.ts`).
 *
 * The generator is seeded, so the same seed always produces the same catalogue.
 */

export const DEMO_SEED = 20260101;
export const DEMO_TIMEZONE = 'America/New_York';
export const DEMO_OWNER_LABEL = 'Demo Creator';

/** Mulberry32 - small, fast, deterministic. */
function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Template {
  platform: Platform;
  title: string;
  hook: string;
  hashtags: string[];
  /** Relative quality multiplier baked into the template (0.5 - 1.8). */
  strength: number;
  minSeconds: number;
  maxSeconds: number;
}

const TEMPLATES: Template[] = [
  // --- Gaming: Warzone / multiplayer gameplay (this creator's core content) -
  { platform: 'YOUTUBE', title: 'I Went 32-0 Using The Most BROKEN Warzone Loadout', hook: 'So I found a loadout so broken it should be illegal.', hashtags: ['#warzone', '#cod', '#loadout'], strength: 1.7, minSeconds: 720, maxSeconds: 1200 },
  { platform: 'YOUTUBE', title: 'Solo vs Full Squad - Rebirth Island Domination', hook: 'So I dropped solo against three full squads.', hashtags: ['#warzone', '#rebirthisland', '#cod'], strength: 1.5, minSeconds: 700, maxSeconds: 1300 },
  { platform: 'YOUTUBE_SHORTS', title: 'This One-Shot Sniper Class Is Unfair', hook: 'Watch this one-shot sniper class end lobbies.', hashtags: ['#cod', '#loadout', '#sniper'], strength: 1.6, minSeconds: 22, maxSeconds: 48 },
  { platform: 'TIKTOK', title: 'insane 1v4 clutch in search and destroy', hook: 'So there I was, 1v4, no ammo, one life left.', hashtags: ['#cod', '#searchanddestroy', '#clutch'], strength: 1.8, minSeconds: 15, maxSeconds: 32 },
  { platform: 'TIKTOK', title: 'when the enemy team has no chance', hook: 'Watch what happens when this team pushes me.', hashtags: ['#warzone', '#gunfight', '#cod'], strength: 1.5, minSeconds: 15, maxSeconds: 40 },
  { platform: 'YOUTUBE_SHORTS', title: 'Nuketown But Everyone Has Riot Shields', hook: 'So Nuketown got even more chaotic than usual.', hashtags: ['#nuketown', '#cod', '#multiplayer'], strength: 1.3, minSeconds: 25, maxSeconds: 55 },
  { platform: 'TIKTOK', title: 'camping in the gulag and it worked', hook: 'If you keep losing gulags, this fixes it in one step.', hashtags: ['#gulag', '#warzone', '#cod'], strength: 1.2, minSeconds: 12, maxSeconds: 28 },

  // --- Tutorial: loadouts, movement tech, settings --------------------------
  { platform: 'YOUTUBE', title: 'The Best Warzone Loadout After The Update (Full Guide)', hook: 'Here are 3 things about this loadout that changed how I play.', hashtags: ['#warzone', '#loadout', '#tutorial'], strength: 1.2, minSeconds: 600, maxSeconds: 1000 },
  { platform: 'YOUTUBE_SHORTS', title: 'How To Slide Cancel Perfectly Every Time', hook: 'If you keep messing up slide cancels, this fixes it in one step.', hashtags: ['#cod', '#tutorial', '#movement'], strength: 1.3, minSeconds: 25, maxSeconds: 55 },
  { platform: 'TIKTOK', title: 'the setting nobody tells you to turn off', hook: 'Turn this setting off before your next match.', hashtags: ['#cod', '#tips', '#settings'], strength: 1.1, minSeconds: 15, maxSeconds: 35 },
  { platform: 'YOUTUBE', title: 'Complete Beginners Guide To Ranked Play', hook: 'What actually happens if you queue into ranked as a beginner?', hashtags: ['#ranked', '#cod', '#guide'], strength: 0.95, minSeconds: 700, maxSeconds: 1100 },

  // --- Story -----------------------------------------------------------------
  { platform: 'YOUTUBE', title: 'The Sweatiest Lobby I Have Ever Played', hook: 'So last night I got put into the sweatiest lobby of my life.', hashtags: ['#storytime', '#cod'], strength: 1.15, minSeconds: 600, maxSeconds: 1000 },
  { platform: 'TIKTOK', title: 'storytime: the cheater who apologized', hook: 'So a cheater actually apologized to me mid game.', hashtags: ['#storytime', '#cod', '#hacker'], strength: 1.25, minSeconds: 25, maxSeconds: 55 },
  { platform: 'YOUTUBE_SHORTS', title: 'What Happened After I Hit Prestige Master', hook: 'So there I was, finally at prestige master, and then this happened.', hashtags: ['#story', '#cod', '#prestige'], strength: 0.95, minSeconds: 30, maxSeconds: 59 },

  // --- Commentary / news -------------------------------------------------------
  { platform: 'YOUTUBE', title: 'We Need To Talk About SBMM In This Game', hook: 'Unpopular opinion: SBMM is worse than everyone admits.', hashtags: ['#commentary', '#cod', '#sbmm'], strength: 1.1, minSeconds: 600, maxSeconds: 950 },
  { platform: 'YOUTUBE_SHORTS', title: 'This Weapon Balance Change Makes No Sense', hook: 'Nobody talks about the real reason this gun got nerfed.', hashtags: ['#cod', '#patchnotes'], strength: 0.9, minSeconds: 25, maxSeconds: 55 },
  { platform: 'TIKTOK', title: 'my honest take on the new battle pass', hook: 'Hot take: this battle pass is a scam and here is why.', hashtags: ['#commentary', '#battlepass', '#cod'], strength: 1.05, minSeconds: 20, maxSeconds: 45 },

  // --- Challenge -----------------------------------------------------------
  { platform: 'YOUTUBE', title: 'Winning A Game Using Only The Riot Shield', hook: 'I have one weapon and twenty minutes to win this game.', hashtags: ['#challenge', '#warzone', '#cod'], strength: 1.45, minSeconds: 780, maxSeconds: 1500 },
  { platform: 'TIKTOK', title: 'I tried getting a nuke with only akimbo pistols', hook: 'I tried getting a nuke using only akimbo pistols.', hashtags: ['#challenge', '#cod', '#nuke'], strength: 1.1, minSeconds: 20, maxSeconds: 50 },
  { platform: 'YOUTUBE_SHORTS', title: 'Last To Get Eliminated Keeps The Loadout', hook: 'Last to get eliminated keeps this loadout forever.', hashtags: ['#challenge', '#warzone'], strength: 0.85, minSeconds: 30, maxSeconds: 59 },

  // --- Funny -----------------------------------------------------------------
  { platform: 'YOUTUBE_SHORTS', title: 'My Teammate Rage Quit After This', hook: 'Watch this teammate rage quit in real time.', hashtags: ['#funny', '#cod', '#rage'], strength: 1.3, minSeconds: 20, maxSeconds: 55 },
  { platform: 'TIKTOK', title: 'the sound this guy made when I killed him', hook: 'You will not believe the sound this guy made.', hashtags: ['#funny', '#cod'], strength: 1.4, minSeconds: 10, maxSeconds: 25 },
  { platform: 'YOUTUBE', title: 'Try Not To Laugh - Call of Duty Fails Compilation', hook: 'Watch this and try not to laugh at these fails.', hashtags: ['#funny', '#cod', '#fails'], strength: 0.8, minSeconds: 600, maxSeconds: 1000 },
  { platform: 'TIKTOK', title: 'explaining why I threw my controller', hook: 'So my controller nearly went through the TV.', hashtags: ['#funny', '#cod', '#rage'], strength: 1.0, minSeconds: 15, maxSeconds: 35 },

  // --- Educational -------------------------------------------------------------
  { platform: 'YOUTUBE', title: 'Recoil Control Explained Without The Nonsense', hook: 'Here is why recoil control actually works, explained properly.', hashtags: ['#educational', '#cod', '#explained'], strength: 1.2, minSeconds: 600, maxSeconds: 1000 },
  { platform: 'YOUTUBE_SHORTS', title: 'Why Time To Kill Matters More Than You Think', hook: 'The real reason low TTK games feel different is not what you think.', hashtags: ['#educational', '#cod'], strength: 1.05, minSeconds: 30, maxSeconds: 55 },
  { platform: 'TIKTOK', title: 'why your aim assist feels different explained in 30 seconds', hook: 'What nobody tells you about aim assist strength.', hashtags: ['#educational', '#cod', '#aimassist'], strength: 0.95, minSeconds: 25, maxSeconds: 45 },

  // --- Reaction ------------------------------------------------------------
  { platform: 'YOUTUBE', title: 'Reacting To The New Update Patch Notes', hook: 'I am about to react to patch notes nobody asked for.', hashtags: ['#reaction', '#cod', '#patchnotes'], strength: 0.9, minSeconds: 600, maxSeconds: 1000 },
  { platform: 'YOUTUBE_SHORTS', title: 'Reacting To Your Clutch Clips', hook: 'You sent me your clutches and I have thoughts.', hashtags: ['#reaction', '#cod', '#clips'], strength: 0.85, minSeconds: 30, maxSeconds: 59 },
  { platform: 'TIKTOK', title: 'reacting to the worst loadout ever submitted', hook: 'If you submitted this loadout, this one is for you.', hashtags: ['#reaction', '#cod', '#loadout'], strength: 0.8, minSeconds: 20, maxSeconds: 45 },

  // --- News ------------------------------------------------------------------
  { platform: 'YOUTUBE', title: 'This Leak Changes Everything About Next Season', hook: 'Nobody talks about the real reason this leak matters.', hashtags: ['#news', '#cod', '#leak'], strength: 1.0, minSeconds: 600, maxSeconds: 950 },
  { platform: 'YOUTUBE_SHORTS', title: 'New Map Leaked And It Looks Insane', hook: 'Here is why this leaked map has everyone talking.', hashtags: ['#news', '#cod', '#leak'], strength: 0.85, minSeconds: 25, maxSeconds: 55 },

  // --- Twitch clips (stream highlights) -------------------------------------
  { platform: 'TWITCH', title: 'Chat did NOT expect this clutch', hook: 'So chat had zero faith in this clutch and then this happened.', hashtags: ['#warzone', '#cod', '#twitchclips'], strength: 1.35, minSeconds: 20, maxSeconds: 55 },
  { platform: 'TWITCH', title: 'Viewer joins lobby and immediately regrets it', hook: 'So a viewer joined my lobby and instantly regretted it.', hashtags: ['#cod', '#multiplayer', '#clip'], strength: 1.15, minSeconds: 15, maxSeconds: 45 },
  { platform: 'TWITCH', title: 'Donation goal hit mid-gunfight', hook: 'So the donation goal hit right in the middle of a gunfight.', hashtags: ['#cod', '#warzone', '#donation'], strength: 1.0, minSeconds: 20, maxSeconds: 50 },
  { platform: 'TWITCH', title: 'Mods explain the new loadout live', hook: 'Here are 3 things chat did not know about this loadout.', hashtags: ['#cod', '#loadout', '#stream'], strength: 0.9, minSeconds: 25, maxSeconds: 58 },

  // --- Kick clips (stream highlights) ---------------------------------------
  { platform: 'KICK', title: 'Stream snipers tried it and lost', hook: 'So stream snipers pulled up and immediately lost.', hashtags: ['#cod', '#warzone', '#kickclips'], strength: 1.25, minSeconds: 15, maxSeconds: 45 },
  { platform: 'KICK', title: 'Chat picks my loadout and it actually worked', hook: 'So chat picked my loadout and somehow it actually worked.', hashtags: ['#cod', '#loadout', '#chat'], strength: 1.05, minSeconds: 20, maxSeconds: 50 },
  { platform: 'KICK', title: 'Raiding into a Warzone lobby', hook: 'So we raided straight into a live Warzone lobby.', hashtags: ['#cod', '#warzone', '#raid'], strength: 0.85, minSeconds: 15, maxSeconds: 40 },
];

/**
 * Day-of-week and hour weights. The demo creator posts best on Thursday and
 * Sunday evenings, which gives the posting-time analyser a real pattern to find
 * rather than noise.
 */
const DAY_QUALITY = [1.15, 0.85, 0.9, 0.95, 1.25, 1.05, 0.8];
const HOUR_QUALITY: Record<number, number> = {
  6: 0.75, 7: 0.8, 8: 0.85, 9: 0.9, 10: 0.95, 11: 1.0, 12: 1.05, 13: 1.0,
  14: 0.95, 15: 1.0, 16: 1.1, 17: 1.2, 18: 1.3, 19: 1.35, 20: 1.25, 21: 1.1, 22: 0.95, 23: 0.85,
};

const POST_HOURS = [7, 9, 11, 12, 15, 16, 17, 18, 19, 20, 21];

interface GenerateOptions {
  seed?: number;
  count?: number;
  now?: Date;
  timezone?: string;
}

/**
 * Builds the cumulative velocity curve for a video.
 * views(m) = total * share7d * (1 - e^(-m/tau)) / (1 - e^(-10080/tau))
 */
function buildSnapshots(
  totalViews: number,
  share7d: number,
  tau: number,
  ageMinutes: number,
  rand: () => number,
): VelocitySnapshot[] {
  const denominator = 1 - Math.exp(-10080 / tau);
  const snapshots: VelocitySnapshot[] = [];
  let previous = 0;
  for (const minutes of VELOCITY_MILESTONES) {
    if (minutes > ageMinutes) break;
    const fraction = (1 - Math.exp(-minutes / tau)) / denominator;
    const noisy = totalViews * share7d * fraction * (0.94 + rand() * 0.12);
    const views = Math.max(previous, Math.round(noisy));
    previous = views;
    snapshots.push({
      minutesAfterPublish: minutes,
      views,
      likes: Math.round(views * (0.03 + rand() * 0.02)),
      comments: Math.round(views * (0.002 + rand() * 0.002)),
      shares: Math.round(views * (0.004 + rand() * 0.004)),
    });
  }
  return snapshots;
}

export function generateDemoVideos(options: GenerateOptions = {}): VideoRecord[] {
  const seed = options.seed ?? DEMO_SEED;
  const count = options.count ?? 50;
  const now = options.now ?? new Date();
  const rand = createRandom(seed);
  const videos: VideoRecord[] = [];

  // Spread publish dates over the last ~11 months, newest last.
  const spanDays = 330;

  for (let i = 0; i < count; i += 1) {
    const template = TEMPLATES[i % TEMPLATES.length];
    const iteration = Math.floor(i / TEMPLATES.length);

    // Publish timestamp -------------------------------------------------
    const progress = i / Math.max(count - 1, 1);
    const daysAgo = Math.round(spanDays * (1 - progress) + (rand() - 0.5) * 6);
    const published = new Date(now.getTime() - Math.max(daysAgo, 0) * 86_400_000);
    const hour = POST_HOURS[Math.floor(rand() * POST_HOURS.length)];
    published.setHours(hour, Math.floor(rand() * 60), 0, 0);
    const ageMinutes = Math.max((now.getTime() - published.getTime()) / 60_000, 20);

    const dayQuality = DAY_QUALITY[published.getDay()];
    const hourQuality = HOUR_QUALITY[published.getHours()] ?? 0.9;

    // Core quality signal ------------------------------------------------
    const luck = 0.7 + rand() * 0.8;
    // Later videos benefit slightly from a growing channel.
    const growth = 0.8 + progress * 0.5;
    const quality = template.strength * dayQuality * hourQuality * luck * growth;

    const isShort = template.platform !== 'YOUTUBE';
    const durationSeconds = Math.round(
      template.minSeconds + rand() * (template.maxSeconds - template.minSeconds),
    );

    // Views ---------------------------------------------------------------
    // Clip platforms (Twitch/Kick) get a smaller base than TikTok/Shorts,
    // reflecting their typically smaller algorithmic reach for a clip pulled
    // from a live stream rather than native short-form content.
    const platformBase =
      template.platform === 'TIKTOK'
        ? 42_000
        : template.platform === 'TWITCH'
          ? 14_000
          : template.platform === 'KICK'
            ? 6_000
            : isShort
              ? 31_000
              : 9_500;
    const rawViews = platformBase * quality * (0.6 + rand() * 0.9);
    // A couple of clear outliers make the dashboard interesting.
    const outlier = rand() > 0.94 ? 3.2 + rand() * 2.4 : 1;
    const views = Math.max(120, Math.round(rawViews * outlier));

    // Retention ------------------------------------------------------------
    const baseRetention = isShort ? 58 : 38;
    const retention = clamp(
      baseRetention * (0.75 + quality * 0.28) + (rand() - 0.5) * 9,
      8,
      isShort ? 96 : 78,
    );
    const avgViewDurationSeconds = round((retention / 100) * durationSeconds, 1);
    const watchTimeMinutes = round((views * avgViewDurationSeconds) / 60, 1);

    // Engagement -----------------------------------------------------------
    const engagementQuality = 0.75 + quality * 0.3 + (rand() - 0.5) * 0.2;
    const likes = Math.round(views * clamp(0.045 * engagementQuality, 0.005, 0.2));
    const comments = Math.round(views * clamp(0.0035 * engagementQuality, 0.0003, 0.03));
    const shares = Math.round(views * clamp(0.006 * engagementQuality, 0.0004, 0.05));

    // Saves: TikTok always reports them, YouTube long-form usually does not.
    const saves =
      template.platform === 'TIKTOK'
        ? Math.round(views * clamp(0.009 * engagementQuality, 0.0005, 0.06))
        : template.platform === 'YOUTUBE_SHORTS' && rand() > 0.35
          ? Math.round(views * clamp(0.004 * engagementQuality, 0.0002, 0.03))
          : null;

    const followersGained = Math.round(views * clamp(0.0028 * engagementQuality, 0.0001, 0.02));

    // CTR is only exposed for YouTube uploads (and not for every one of them).
    const hasCtr = template.platform === 'YOUTUBE' && rand() > 0.15;
    const impressions = hasCtr ? Math.round(views / clamp(0.045 * quality, 0.015, 0.16)) : null;
    const clickThroughRate =
      hasCtr && impressions ? round((views / impressions) * 100, 2) : null;

    // Velocity -------------------------------------------------------------
    const share7d = isShort ? 0.6 + rand() * 0.28 : 0.34 + rand() * 0.3;
    const tau = isShort ? 140 + rand() * 900 : 900 + rand() * 3200;
    // ~8% of videos have no snapshots at all, exercising the empty states.
    const snapshots = rand() > 0.08 ? buildSnapshots(views, share7d, tau, ageMinutes, rand) : [];

    const titleSuffix = iteration > 0 ? ' (Part ' + (iteration + 1) + ')' : '';
    const title = template.title + titleSuffix;
    const caption = template.hook.length > 90 ? template.hook.slice(0, 87) + '...' : template.hook;
    const description =
      title +
      '. ' +
      template.hook +
      ' Full breakdown, parts list and timestamps in the pinned comment. ' +
      template.hashtags.join(' ');

    const classification = classifyCategory(
      { title, caption, description, hashtags: template.hashtags },
      DEFAULT_CATEGORIES,
    );

    videos.push({
      id: 'demo-' + String(i + 1).padStart(3, '0'),
      platformVideoId: 'demo_' + template.platform.toLowerCase() + '_' + (i + 1),
      platform: template.platform,
      title,
      caption,
      description,
      hashtags: template.hashtags,
      categorySlug: classification.slug,
      categoryName: classification.name,
      categoryAuto: true,
      hookText: template.hook,
      hookType: classifyHook(template.hook),
      hookAuto: true,
      durationSeconds,
      publishedAt: published.toISOString(),
      thumbnailUrl: null,
      source: 'DEMO',
      metrics: {
        views,
        likes,
        comments,
        shares,
        saves,
        followersGained,
        watchTimeMinutes,
        averageViewDurationSeconds: avgViewDurationSeconds,
        averagePercentageViewed: round(retention, 1),
        impressions,
        clickThroughRate,
      },
      snapshots,
    });
  }

  return videos.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function buildDemoDataset(options: GenerateOptions = {}): Dataset {
  return {
    isDemo: true,
    ownerLabel: DEMO_OWNER_LABEL,
    timezone: options.timezone ?? DEMO_TIMEZONE,
    videos: generateDemoVideos(options),
    categories: DEFAULT_CATEGORIES,
    connectedAccounts: [],
  };
}
