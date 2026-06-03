-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "fullName" TEXT,
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_source_email_key" ON "waitlist_entries"("source", "email");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_source_phone_key" ON "waitlist_entries"("source", "phone");

-- CreateIndex
CREATE INDEX "waitlist_entries_source_createdAt_idx" ON "waitlist_entries"("source", "createdAt");
