-- CreateEnum
CREATE TYPE "PublishJobStatus" AS ENUM ('PENDING', 'UPLOADING_VIDEO', 'SETTING_THUMBNAIL', 'SAVING', 'DONE', 'FAILED');

-- AlterEnum
ALTER TYPE "DataSource" ADD VALUE 'YOUTUBE_UPLOAD';

-- CreateTable
CREATE TABLE "thumbnail_assets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "source_video_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thumbnail_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connected_account_id" TEXT NOT NULL,
    "status" "PublishJobStatus" NOT NULL DEFAULT 'PENDING',
    "video_file_path" TEXT NOT NULL,
    "thumbnail_asset_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category_id" TEXT NOT NULL DEFAULT '20',
    "privacy" TEXT NOT NULL DEFAULT 'private',
    "total_bytes" BIGINT NOT NULL,
    "bytes_uploaded" BIGINT NOT NULL DEFAULT 0,
    "resumable_session_uri" TEXT,
    "result_video_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publish_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "thumbnail_assets_user_id_created_at_idx" ON "thumbnail_assets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "publish_jobs_user_id_created_at_idx" ON "publish_jobs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "thumbnail_assets" ADD CONSTRAINT "thumbnail_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_connected_account_id_fkey" FOREIGN KEY ("connected_account_id") REFERENCES "connected_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
