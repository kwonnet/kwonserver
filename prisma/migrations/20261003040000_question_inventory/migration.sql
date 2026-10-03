CREATE TABLE "QuizQuestion" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "options" TEXT[] NOT NULL,
  "normalizedHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuizQuestion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GameCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QuizQuestion_categoryId_normalizedHash_key" ON "QuizQuestion"("categoryId", "normalizedHash");
CREATE INDEX "QuizQuestion_categoryId_id_idx" ON "QuizQuestion"("categoryId", "id");
