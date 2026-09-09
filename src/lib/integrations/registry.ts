import type { Platform } from '@/lib/types';
import type { PlatformIntegration } from '@/lib/integrations/types';
import { youtubeIntegration } from '@/lib/integrations/youtube';
import { tiktokIntegration } from '@/lib/integrations/tiktok';
import { twitchIntegration } from '@/lib/integrations/twitch';
import { KICK_STATUS } from '@/lib/integrations/kick';

/**
 * Integration registry.
 *
 * Adding a platform with a real API means implementing `PlatformIntegration`
 * and adding it to `INTEGRATIONS` - nothing else in the app hard-codes a
 * platform list for syncing. A platform with no usable public API yet (Kick)
 * is instead described by a plain `IntegrationStatus` row so Settings can
 * honestly say "not available" without a fake OAuth button - see kick.ts.
 */

export const INTEGRATIONS: PlatformIntegration[] = [
  youtubeIntegration,
  tiktokIntegration,
  twitchIntegration,
];

/**
 * YouTube Shorts is served by the YouTube integration rather than having its
 * own OAuth app, so it maps to the same provider. Kick has no integration
 * object at all (see kick.ts) and correctly returns null here.
 */
export function getIntegration(platform: Platform): PlatformIntegration | null {
  if (platform === 'YOUTUBE_SHORTS') return youtubeIntegration;
  return INTEGRATIONS.find((i) => i.platform === platform) ?? null;
}

export interface IntegrationStatus {
  platform: Platform;
  label: string;
  configured: boolean;
  requiredEnvVars: string[];
  missingEnvVars: string[];
  limitations: string[];
  /** True when there is a real OAuth "Connect" flow at all (false for Kick). */
  connectable: boolean;
}

export function integrationStatuses(): IntegrationStatus[] {
  const real = INTEGRATIONS.map((integration) => ({
    platform: integration.platform,
    label: integration.label,
    configured: integration.isConfigured(),
    requiredEnvVars: integration.requiredEnvVars,
    missingEnvVars: integration.requiredEnvVars.filter((name) => !process.env[name]),
    limitations: integration.limitations,
    connectable: true,
  }));
  return [...real, KICK_STATUS];
}

const CALLBACK_SLUGS: Partial<Record<Platform, string>> = {
  TIKTOK: 'tiktok',
  TWITCH: 'twitch',
};

/** Absolute OAuth callback URL for a platform. */
export function callbackUrl(platform: Platform, origin?: string): string {
  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const slug = CALLBACK_SLUGS[platform] ?? 'youtube';
  return base.replace(/\/$/, '') + '/api/connect/' + slug + '/callback';
}
