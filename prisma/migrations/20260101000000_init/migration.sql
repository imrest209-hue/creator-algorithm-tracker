-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('YOUTUBE', 'YOUTUBE_SHORTS', 'TIKTOK', 'TWITCH', 'KICK');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('DEMO', 'MANUAL', 'CSV', 'YOUTUBE_API', 'TIKTOK_API', 'TWITCH_API');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "HookType" AS ENUM ('QUESTION', 'CONTROVERSIAL', 'STORY', 'YOU_WONT_BELIEVE', 'IMMEDIATE_ACTION', 'PROBLEM_SOLUTION', 'CURIOSITY', 'LISTICLE', 'DIRECT_ADDRESS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('VIRAL_GROWTH', 'HIGH_RETENTION', 'LOW_PERFORMANCE', 'MILESTONE', 'STRONG_TOPIC', 'POSTING_OPPORTUNITY');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'GOOD', 'WARN');

-- CreateEnum
CREATE TYPE "RecommendationKind" AS ENUM ('FOLLOW_UP', 'PART_TWO', 'VARIATION', 'SIMILAR_CONCEPT', 'NEW_CONCEPT', 'FORMAT_SHIFT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connected_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "external_id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "status_message" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "connected_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hooks" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "HookType" NOT NULL DEFAULT 'UNKNOWN',
    "is_auto" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connected_account_id" TEXT,
    "platform" "Platform" NOT NULL,
    "platform_video_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "description" TEXT,
    "category_id" TEXT,
    "category_auto" BOOLEAN NOT NULL DEFAULT true,
    "duration_seconds" INTEGER NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "thumbnail_url" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_metrics" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" BIGINT NOT NULL DEFAULT 0,
    "likes" BIGINT NOT NULL DEFAULT 0,
    "comments" BIGINT NOT NULL DEFAULT 0,
    "shares" BIGINT NOT NULL DEFAULT 0,
    "saves" BIGINT,
    "followers_gained" INTEGER,
    "watch_time_minutes" DOUBLE PRECISION,
    "average_view_duration_seconds" DOUBLE PRECISION,
    "average_percentage_viewed" DOUBLE PRECISION,
    "impressions" BIGINT,
    "click_through_rate" DOUBLE PRECISION,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "video_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "velocity_snapshots" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "minutes_after_publish" INTEGER NOT NULL,
    "views" BIGINT NOT NULL,
    "likes" BIGINT,
    "comments" BIGINT,
    "shares" BIGINT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "velocity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hashtags" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hashtags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_hashtags" (
    "video_id" TEXT NOT NULL,
    "hashtag_id" TEXT NOT NULL,

    CONSTRAINT "video_hashtags_pkey" PRIMARY KEY ("video_id","hashtag_id")
);

-- CreateTable
CREATE TABLE "performance_scores" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "viral_score" INTEGER,
    "confidence" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posting_times" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" "Platform",
    "day_of_week" INTEGER NOT NULL,
    "hour_of_day" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "video_count" INTEGER NOT NULL,
    "avg_views" DOUBLE PRECISION,
    "avg_performance_score" DOUBLE PRECISION,
    "avg_engagement_rate" DOUBLE PRECISION,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posting_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_video_id" TEXT,
    "kind" "RecommendationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category_name" TEXT,
    "evidence" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "is_generated" BOOLEAN NOT NULL DEFAULT true,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT,
    "display_name" TEXT,
    "notes" TEXT,
    "data_source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "competitor_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_videos" (
    "id" TEXT NOT NULL,
    "competitor_id" TEXT NOT NULL,
    "platform_video_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "duration_seconds" INTEGER,
    "views" BIGINT,
    "likes" BIGINT,
    "comments" BIGINT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "platform" "Platform",
    "rows_total" INTEGER NOT NULL,
    "rows_imported" INTEGER NOT NULL,
    "rows_skipped" INTEGER NOT NULL,
    "errors" JSONB,
    "source" "DataSource" NOT NULL DEFAULT 'CSV',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "connected_accounts_user_id_idx" ON "connected_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "connected_accounts_user_id_platform_external_id_key" ON "connected_accounts"("user_id", "platform", "external_id");

-- CreateIndex
CREATE INDEX "content_categories_user_id_idx" ON "content_categories"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_categories_user_id_slug_key" ON "content_categories"("user_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "hooks_video_id_key" ON "hooks"("video_id");

-- CreateIndex
CREATE INDEX "hooks_type_idx" ON "hooks"("type");

-- CreateIndex
CREATE INDEX "videos_user_id_published_at_idx" ON "videos"("user_id", "published_at");

-- CreateIndex
CREATE INDEX "videos_user_id_platform_idx" ON "videos"("user_id", "platform");

-- CreateIndex
CREATE INDEX "videos_category_id_idx" ON "videos"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "videos_user_id_platform_platform_video_id_key" ON "videos"("user_id", "platform", "platform_video_id");

-- CreateIndex
CREATE INDEX "video_metrics_video_id_captured_at_idx" ON "video_metrics"("video_id", "captured_at");

-- CreateIndex
CREATE INDEX "velocity_snapshots_video_id_idx" ON "velocity_snapshots"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "velocity_snapshots_video_id_minutes_after_publish_key" ON "velocity_snapshots"("video_id", "minutes_after_publish");

-- CreateIndex
CREATE UNIQUE INDEX "hashtags_tag_key" ON "hashtags"("tag");

-- CreateIndex
CREATE INDEX "video_hashtags_hashtag_id_idx" ON "video_hashtags"("hashtag_id");

-- CreateIndex
CREATE INDEX "performance_scores_video_id_computed_at_idx" ON "performance_scores"("video_id", "computed_at");

-- CreateIndex
CREATE INDEX "posting_times_user_id_idx" ON "posting_times"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "posting_times_user_id_platform_day_of_week_hour_of_day_time_key" ON "posting_times"("user_id", "platform", "day_of_week", "hour_of_day", "timezone");

-- CreateIndex
CREATE INDEX "recommendations_user_id_created_at_idx" ON "recommendations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "competitor_accounts_user_id_idx" ON "competitor_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_accounts_user_id_platform_handle_key" ON "competitor_accounts"("user_id", "platform", "handle");

-- CreateIndex
CREATE INDEX "competitor_videos_competitor_id_published_at_idx" ON "competitor_videos"("competitor_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_videos_competitor_id_platform_video_id_key" ON "competitor_videos"("competitor_id", "platform_video_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_user_id_type_key" ON "notification_settings"("user_id", "type");

-- CreateIndex
CREATE INDEX "import_jobs_user_id_created_at_idx" ON "import_jobs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_categories" ADD CONSTRAINT "content_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hooks" ADD CONSTRAINT "hooks_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_connected_account_id_fkey" FOREIGN KEY ("connected_account_id") REFERENCES "connected_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "content_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_metrics" ADD CONSTRAINT "video_metrics_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "velocity_snapshots" ADD CONSTRAINT "velocity_snapshots_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_hashtags" ADD CONSTRAINT "video_hashtags_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_hashtags" ADD CONSTRAINT "video_hashtags_hashtag_id_fkey" FOREIGN KEY ("hashtag_id") REFERENCES "hashtags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_scores" ADD CONSTRAINT "performance_scores_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_source_video_id_fkey" FOREIGN KEY ("source_video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_accounts" ADD CONSTRAINT "competitor_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_videos" ADD CONSTRAINT "competitor_videos_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitor_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

