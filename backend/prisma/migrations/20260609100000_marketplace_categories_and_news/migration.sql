-- Extend Product for Temu-style marketplace + add NewsItem for landing-page ticker

-- AlterTable: products — new columns
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "compareAtPrice" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "rating" DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "reviewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "products_category_isActive_idx" ON "products"("category", "isActive");
CREATE INDEX IF NOT EXISTS "products_isFeatured_idx" ON "products"("isFeatured");

-- CreateTable: news_items
CREATE TABLE IF NOT EXISTS "news_items" (
    "id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT,
    "link" TEXT,
    "source" TEXT,
    "category" TEXT,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLive" BOOLEAN NOT NULL DEFAULT true,
    "isPriority" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "news_items_isLive_publishedAt_idx" ON "news_items"("isLive", "publishedAt");
