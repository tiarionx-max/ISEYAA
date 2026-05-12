-- CreateTable
CREATE TABLE "attraction_bookmarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attractionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attraction_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attraction_bookmarks_userId_attractionId_key" ON "attraction_bookmarks"("userId", "attractionId");

-- AddForeignKey
ALTER TABLE "attraction_bookmarks" ADD CONSTRAINT "attraction_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attraction_bookmarks" ADD CONSTRAINT "attraction_bookmarks_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "attractions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
