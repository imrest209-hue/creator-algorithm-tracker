import type { IntegrationStatus } from '@/lib/integrations/registry';

/**
 * KICK - honest "not yet available" status.
 * ---------------------------------------------------------------------------
 * Kick is a fully supported platform everywhere else in this app: it appears
 * in the platform type, the database schema, filters, the demo dataset, CSV
 * import, and manual video entry. What it does NOT have is a live OAuth sync,
 * because Kick's public developer API (as of this build) does not expose
 * clip- or VOD-level performance analytics - only chat, moderation and
 * channel/stream-state endpoints exist.
 *
 * Building an OAuth "Connect Kick" button against that API would produce a
 * flow that completes but has nothing meaningful to sync, which would be
 * actively misleading. Instead this reports Kick as un-connectable and points
 * the user at CSV import / manual entry, which do deliver real, correct
 * tracking today. When Kick publishes an analytics endpoint, a real
 * `kickIntegration: PlatformIntegration` can be added the same way
 * src/lib/integrations/twitch.ts was, and this file deleted.
 */
export const KICK_STATUS: IntegrationStatus = {
  platform: 'KICK',
  label: 'Kick',
  configured: false,
  requiredEnvVars: [],
  missingEnvVars: [],
  connectable: false,
  limitations: [
    'Kick has not yet published a public API endpoint for clip or VOD performance analytics (view counts, engagement, etc).',
    'Track Kick performance today via CSV import or by adding videos manually - both are fully supported for this platform.',
    'When Kick publishes an analytics API, a live OAuth connection can be added without changing how Kick data is stored or displayed.',
  ],
};
