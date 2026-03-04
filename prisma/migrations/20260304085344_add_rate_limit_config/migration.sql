-- CreateTable
CREATE TABLE "rate_limit_configs" (
    "id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "max_requests" INTEGER NOT NULL DEFAULT 100,
    "time_window_seconds" INTEGER NOT NULL DEFAULT 60,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_configs_namespace_key" ON "rate_limit_configs"("namespace");

-- CreateIndex
CREATE INDEX "rate_limit_configs_namespace_idx" ON "rate_limit_configs"("namespace");
