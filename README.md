# Creator Algorithm Tracker

A dark-mode analytics dashboard for YouTube, YouTube Shorts, TikTok, Twitch
and Kick that turns your own video/clip history into transparent, explainable
scores and recommendations — never a claim about how a platform's
recommendation algorithm actually works. The demo dataset and defaults are
tuned for a Call of Duty channel, but the scoring engine, categorisation and
recommendations are fully generic and work for any content.

Works immediately with generated **demo data** (clearly labelled `DEMO`
everywhere), and can be connected to real accounts once PostgreSQL and OAuth
credentials are configured.

## Table of contents

1. [Install](#1-install)
2. [Configure PostgreSQL](#2-configure-postgresql)
3. [Configure environment variables](#3-configure-environment-variables)
4. [Connect YouTube](#4-connect-youtube)
5. [Connect TikTok](#5-connect-tiktok)
6. [Connect Twitch](#6-connect-twitch)
7. [Kick](#7-kick)
8. [Run in development](#8-run-in-development)
9. [Run in production](#9-run-in-production)
10. [Import CSV data](#10-import-csv-data)
11. [How the performance score works](#11-how-the-performance-score-works)
12. [How the viral potential score works](#12-how-the-viral-potential-score-works)
13. [API limitations](#13-api-limitations)
14. [Security considerations](#14-security-considerations)
15. [Testing](#15-testing)
16. [Project structure](#16-project-structure)
17. [Known limitations / TODO](#17-known-limitations--todo)

---

## 1. Install

Requires Node.js 20+.

```bash
npm install
```

The app **works without any further setup** — visit `/dashboard` and you'll
see 50 generated demo videos with full analytics, clearly labelled `DEMO`.
Everything below is for connecting real accounts.

## 2. Configure PostgreSQL

Any PostgreSQL 14+ instance works — local, Docker, or a hosted provider
(Supabase, Neon, Railway, RDS, etc).

Local via Docker:

```bash
docker run --name creator-tracker-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=creator_tracker -p 5432:5432 -d postgres:16
```

Then set `DATABASE_URL` (see below) and run migrations:

```bash
npx prisma migrate deploy   # applies the committed migration
# or, while developing the schema:
npx prisma migrate dev
```

Optional: seed a demo account with 50 videos already loaded into the
database (separate from the zero-setup demo mode, which never touches the
database at all):

```bash
npm run db:seed
# creates demo@example.com / demo12345678
```

## 3. Configure environment variables

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | For accounts/real data | PostgreSQL connection string |
| `AUTH_SECRET` | For accounts | Random secret (`openssl rand -base64 48`) |
| `APP_ENCRYPTION_KEY` | For OAuth connections | AES-256-GCM key, must decode to exactly 32 bytes (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | For OAuth connections | Public base URL, used to build callback URLs |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | For YouTube | OAuth client from Google Cloud Console |
| `YOUTUBE_API_KEY` | Optional | Server API key for the public Trends page only |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | For TikTok | App credentials from TikTok for Developers |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | For Twitch | App credentials from dev.twitch.tv/console |
| `LOG_LEVEL` | Optional | `debug` \| `info` \| `warn` \| `error` |

Kick has no env vars: it has no public analytics API to connect to yet (see
[§7](#7-kick)) — it's still fully usable via CSV import and manual entry.

**Never commit `.env`.** `.env.example` has no real secrets.

## 4. Connect YouTube

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable **YouTube Data API v3** and **YouTube Analytics API v2**.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add authorized redirect URI: `{NEXT_PUBLIC_APP_URL}/api/connect/youtube/callback`.
4. Put the client ID/secret in `.env`.
5. Sign in to the app, go to **Settings → Connected accounts → Connect YouTube**.

The app requests the read-only scopes `youtube.readonly` and
`yt-analytics.readonly` — it never requests upload or channel-management
permissions.

## 5. Connect TikTok

1. Create an app at [TikTok for Developers](https://developers.tiktok.com/)
   with **Login Kit** and the `video.list` scope, and get it approved.
2. Add redirect URI: `{NEXT_PUBLIC_APP_URL}/api/connect/tiktok/callback`.
3. Put the client key/secret in `.env`.
4. Sign in to the app, go to **Settings → Connected accounts → Connect TikTok**.

Sandbox apps only return data for accounts explicitly added as testers in the
TikTok developer portal.

## 6. Connect Twitch

1. Register an application at [dev.twitch.tv/console](https://dev.twitch.tv/console/apps).
2. Add redirect URI: `{NEXT_PUBLIC_APP_URL}/api/connect/twitch/callback`.
3. Put the client ID/secret in `.env`.
4. Sign in to the app, go to **Settings → Connected accounts → Connect Twitch**.

Twitch "videos" here are **clips** (the Helix Clips API), since Twitch has no
per-upload model like YouTube/TikTok and clips are the unit with a reliable
public view count. Likes, comments, shares, retention, watch time and
per-clip follower attribution are not exposed by Twitch's public API and are
stored as unavailable — see [§13](#13-api-limitations).

## 7. Kick

Kick does not currently publish a public API endpoint for clip or VOD
performance analytics (its public API covers chat/moderation/channel state,
not historical view/engagement data). Rather than ship an OAuth "Connect"
button that completes but has nothing real to sync, Kick is fully supported
everywhere else in the app — tracking, filtering, the demo dataset, scoring —
and you track real Kick performance via **CSV import** or **manual video
entry**. Settings shows Kick's status as "API not yet available" rather than
a working connection, so this is never presented as more than it is.

## 8. Run in development

```bash
npm run dev
```

Visit `http://localhost:3000`.

## 9. Run in production

```bash
npm run build
npm run start
```

Or deploy to Vercel (or any Node host): set the environment variables above
in the platform's dashboard, and run `npx prisma migrate deploy` as part of
your deploy step (a `postinstall`/release hook, or manually against the
production database).

## 10. Import CSV data

Go to **CSV import**. Steps:

1. Pick the CSV export (YouTube Studio, TikTok analytics export, or your own
   spreadsheet) and a default platform (used only for rows with no platform
   column).
2. Columns are auto-mapped from common header names (see the table on the
   import page for the full list of recognised aliases).
3. Review the preview: rows are validated for missing/invalid dates, missing
   or non-numeric required fields, and duplicates against your existing
   library (by platform + video ID).
4. Click **Import**. Duplicates update the existing video by default, unless
   you check "skip duplicates".

Any column your file doesn't have is simply left unmapped — the corresponding
metric is stored as unavailable, never as zero.

## 11. How the performance score works

The performance score (0–100) is entirely **relative to your own history** —
there is no external benchmark and no attempt to reverse-engineer a
platform's ranking algorithm.

For each video, six components are compared against a baseline built from
your other videos (preferring same-platform videos, falling back to
account-wide once there are enough of them):

| Component | Weight | Compared against |
|---|---|---|
| Views | 20% | Median views of the baseline set |
| Retention (avg % viewed) | 20% | Mean retention of the baseline set |
| Engagement rate | 18% | Mean (likes+comments+shares+saves)/views |
| View velocity | 18% | Mean views/hour in the first 3 hours |
| Follower conversion | 12% | Mean followers gained per view |
| Click-through rate | 12% | Mean CTR (YouTube only, when available) |

Each component's ratio (`value / baseline`) is mapped onto a 0–100 subscore
with one published curve: **0.25× → 0, 0.5× → 25, 1× (exactly average) → 50,
2× → 75, 4× → 100**. A video that matches your account average scores 50 on
that component.

**If a component's data is unavailable** (e.g. TikTok doesn't expose CTR),
it is dropped entirely and its weight is redistributed proportionally across
the components that do have data — never replaced with a zero or an average.
The video page shows exactly which components were used, their raw values,
and the resulting subscores.

The final score also carries a **confidence** level (`HIGH`/`MEDIUM`/`LOW`/
`NONE`) based on how many comparison videos were available.

## 12. How the viral potential score works

A **separate** 0–100 score, deliberately built only from signals measurable
**early** in a video's life: view velocity in the first 3 hours (34%
weight), retention (18%), share rate (18%), comment rate (12%), engagement
rate (10%), follower conversion (8%). Same ratio-to-subscore curve as the
performance score.

This score is a description of **measured early performance relative to
your own history**. It carries an explicit confidence level and a
disclaimer, and the UI never states or implies that a video will go viral —
only how its early numbers compare to your past videos.

## 13. API limitations

**YouTube** (Data API v3 + Analytics API v2):
- Retention, watch time, average view duration, subscribers gained,
  impressions and CTR require the Analytics API and are only available for
  channels you own.
- Per-video **share count is not exposed by the API at all** — stored as 0,
  can be added manually.
- Shorts are inferred from duration (≤180s); there's no explicit API flag.
- Default quota: 10,000 units/day. A 500-video sync costs roughly 25 units.

**TikTok** (Login Kit + Display API v2):
- Retention, average watch time, saves, impressions, CTR and per-video
  follower attribution **are not exposed by the Display API**. These are
  stored as `null` and shown as *"Unavailable through current TikTok API
  permissions."* — never estimated. Import a TikTok Analytics CSV export to
  add them.
- Video list pages in batches of ≤20 with no arbitrary date filtering.
- Sandbox apps only see explicitly-added tester accounts.

**Twitch** (Helix API):
- Tracks **clips**, not full broadcast VODs — clips are the unit with a
  consistently available public view count.
- Likes, comments, shares, saves, retention, watch time, impressions, CTR and
  per-clip follower attribution **are not exposed by the public API** and are
  stored as unavailable (likes/comments/shares as 0, the rest as `null`).
- Clip view counts can take a short time to settle right after creation.

**Kick**:
- No public analytics API for clip/VOD performance exists yet, so there is no
  live sync — see [§7](#7-kick). Fully trackable via CSV import or manual entry.

**Public trend data**: the Trends page's "Public / trend data" section only
uses YouTube's official public "most popular" chart via a server API key. No
scraping, no undocumented endpoints. If `YOUTUBE_API_KEY` isn't set, the
section shows an explicit "not connected" state — never fabricated trends.

## 14. Security considerations

- **Platform passwords are never collected.** YouTube, TikTok and Twitch are
  connected via OAuth only. Kick has no live connection at all yet ([§7](#7-kick)).
- Passwords for this app's own accounts are hashed with **bcrypt** (cost 12).
- OAuth access/refresh tokens are encrypted at rest with **AES-256-GCM**
  before being stored (`src/lib/auth/crypto.ts`).
- Sessions are random 32-byte tokens; only their **SHA-256 hash** is stored,
  so a database leak alone cannot be replayed as a session. Cookies are
  `httpOnly`, `SameSite=Lax`, and `Secure` in production.
- OAuth flows use a random `state` value stored in an `httpOnly` cookie and
  compared with a constant-time check to prevent CSRF.
- All external HTTP calls go through a shared client that classifies errors
  (auth/rate-limit/quota/server/network), retries only what's safe to retry,
  and never fabricates a value on failure.
- Every "unavailable" metric renders as **Unavailable**, with a tooltip
  explaining why — never silently substituted with 0 or an estimate.

## 15. Testing

```bash
npm run test        # run once
npm run test:watch  # watch mode
```

Covers: performance-score math (including weight redistribution when data is
missing), engagement-rate/velocity calculations, CSV parsing/validation/
duplicate-detection, HTTP client retry/error-classification behavior,
Prisma-row-to-domain mapping, auth (password hashing, token encryption,
schema validation), and recommendation/classification logic.

## 16. Project structure

```
prisma/schema.prisma        Database schema
prisma/seed.ts               Seeds a demo account into Postgres
src/lib/types.ts             Core domain types
src/lib/analytics/           Pure, testable analytics engine (no I/O)
src/lib/demo/generator.ts    Deterministic synthetic demo dataset
src/lib/data/                Dataset providers (demo vs. real) + viewer resolution
src/lib/csv/                 CSV parsing + import validation
src/lib/integrations/        YouTube/TikTok/Twitch OAuth + API clients, Kick status
src/lib/auth/                Sessions, password hashing, token encryption
src/app/(app)/               Dashboard pages (behind the sidebar shell)
src/app/(auth)/              Login/register pages
src/app/api/                 Route handlers (auth, import, export, OAuth, analyst)
src/components/              UI: charts, tables, forms
tests/                       Vitest suite
```

## 17. Known limitations / TODO

- Competitor/reference-creator tracking is manual-entry only; there is no
  automated public-data sync yet (the schema and API support it — an
  integration can be added the same way YouTube/TikTok were).
- No automated notification delivery (email/push) — notifications are
  computed on page load; a scheduled job could push them instead.
