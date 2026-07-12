-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Recording" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "duration" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "audioUrl" TEXT,
    "lessonId" TEXT,
    "quarterId" TEXT,
    "khutbahId" TEXT,
    CONSTRAINT "Recording_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recording_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "Quarter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recording_khutbahId_fkey" FOREIGN KEY ("khutbahId") REFERENCES "Khutbah" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Recording" ("audioUrl", "duration", "id", "lessonId", "quarterId", "title", "uploadedAt", "version") SELECT "audioUrl", "duration", "id", "lessonId", "quarterId", "title", "uploadedAt", "version" FROM "Recording";
DROP TABLE "Recording";
ALTER TABLE "new_Recording" RENAME TO "Recording";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
