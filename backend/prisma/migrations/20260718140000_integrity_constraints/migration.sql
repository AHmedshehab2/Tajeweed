CREATE UNIQUE INDEX "Chapter_order_key" ON "Chapter"("order");
CREATE UNIQUE INDEX "Quarter_hizbId_number_key" ON "Quarter"("hizbId", "number");

CREATE TABLE "MediaCleanupJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileUrl" TEXT,
    "cloudinaryId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);
