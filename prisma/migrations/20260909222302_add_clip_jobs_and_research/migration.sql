-- CreateEnum
CREATE TYPE "ClipJobStatus" AS ENUM ('DRAFT', 'RENDERING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "clip_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ClipJobStatus" NOT NULL DEFAULT 'DRAFT',
    "source_file_path" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "output_file_path" TEXT,
    "duration_seconds" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "edit_spec" JSONB NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clip_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_queries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "engine" TEXT NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clip_jobs_user_id_created_at_idx" ON "clip_jobs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "research_queries_user_id_created_at_idx" ON "research_queries"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "clip_jobs" ADD CONSTRAINT "clip_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_queries" ADD CONSTRAINT "research_queries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
