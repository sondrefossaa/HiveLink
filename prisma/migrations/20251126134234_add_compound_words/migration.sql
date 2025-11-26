-- CreateTable
CREATE TABLE "daily_puzzles" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "start_word" TEXT NOT NULL,
    "goal_word" TEXT NOT NULL,
    "optimal_steps" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_puzzles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" SERIAL NOT NULL,
    "puzzle_date" DATE NOT NULL,
    "player_id" TEXT NOT NULL,
    "words_used" INTEGER NOT NULL,
    "layers" INTEGER NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compound_words" (
    "word" TEXT NOT NULL,
    "parts" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compound_words_pkey" PRIMARY KEY ("word")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_puzzles_date_key" ON "daily_puzzles"("date");

-- CreateIndex
CREATE INDEX "scores_puzzle_date_idx" ON "scores"("puzzle_date");

-- CreateIndex
CREATE INDEX "scores_player_id_idx" ON "scores"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "scores_puzzle_date_player_id_key" ON "scores"("puzzle_date", "player_id");
