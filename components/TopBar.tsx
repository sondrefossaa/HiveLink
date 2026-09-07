"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import ShareButton from "./ShareButton";
import { getPlayerStats } from "@/lib/player-id";
import type { PuzzleDifficulty, PuzzleMode } from "@/types";

interface TopBarProps {
  puzzleNumber?: number;
  date?: string;
  wordsUsed: number;
  layersExplored: number;
  pathsFound: number;
  mode: PuzzleMode;
  onModeChange: (mode: PuzzleMode) => void;
  difficulty: PuzzleDifficulty;
  onDifficultyChange: (difficulty: PuzzleDifficulty) => void;
  onGeneratePractice: () => void;
  isGeneratingPractice: boolean;
  isDaily: boolean;
  parValue?: number;
  // Sharing props
  startWord: string;
  goalWord: string;
  startTime: number;
  isComplete: boolean;
  bestPath?: string[];
  onShowPaths?: () => void;
  onShowLeaderboard?: () => void;
}

const difficultyLabels: Record<PuzzleDifficulty, string> = {
  easy: "Lett",
  medium: "Middels",
  hard: "Vanskelig",
};

export default function TopBar({
  puzzleNumber,
  date,
  wordsUsed,
  layersExplored,
  pathsFound,
  mode,
  onModeChange,
  difficulty,
  onDifficultyChange,
  onGeneratePractice,
  isGeneratingPractice,
  isDaily,
  parValue,
  startWord,
  goalWord,
  startTime,
  isComplete,
  bestPath,
  onShowPaths,
  onShowLeaderboard,
}: TopBarProps) {
  const [currentStreak, setCurrentStreak] = useState(0);

  // Update streak when component mounts or when puzzle is completed
  useEffect(() => {
    const stats = getPlayerStats();
    setCurrentStreak(stats.currentStreak);
  }, [isComplete]);

  // Format date for display
  const formattedDate = date
    ? new Date(date + "T00:00:00").toLocaleDateString("nb-NO", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-40"
      style={{ touchAction: "pan-x pan-y" }}
    >
      <div className="bg-hive-dark/95 backdrop-blur-sm">
        <div className="w-full px-4 sm:px-6 py-3">
          <div className="relative flex items-center justify-between gap-4">
            {/* Left: Logo and puzzle info */}
            <div className="flex items-center gap-4 flex-1">
              <div className="flex items-center gap-2">
                <img src="/logo.svg" alt="HiveLink" className="h-10 w-10 shrink-0" />
                <h1 className="text-xl font-display font-bold text-gradient-gold hidden sm:block">
                  HiveLink
                </h1>
              </div>

              <div className="flex items-center gap-2 text-sm">
                {isDaily ? (
                  <span className="bg-hive-graphite/80 px-3 py-1 rounded-full text-hive-yellow font-medium">
                    🐝 {currentStreak} dagers rekke
                  </span>
                ) : (
                  <span className="bg-hive-yellow/10 text-hive-yellow px-3 py-1 rounded-full font-medium">
                    Øvelse
                  </span>
                )}
              </div>

              {/* Date */}
              <div className="hidden md:flex items-center gap-2 text-sm">
                {formattedDate && isDaily && (
                  <span className="text-gray-400">{formattedDate}</span>
                )}
              </div>
            </div>

            {/* Center: Stats */}
            <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2">
              <div className="flex items-center gap-3 sm:gap-6">
                <div className="text-center">
                  <motion.div
                    key={wordsUsed}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                    className="text-lg sm:text-xl font-bold text-white"
                  >
                    {wordsUsed}
                  </motion.div>
                  <div className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">
                    Ord
                  </div>
                </div>

                <div className="w-px h-8 bg-hive-graphite" />

                <div className="text-center">
                  <motion.div
                    key={layersExplored}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                    className="text-lg sm:text-xl font-bold text-white"
                  >
                    {layersExplored}
                  </motion.div>
                  <div className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">
                    Lag
                  </div>
                </div>

                {pathsFound > 0 && (
                  <>
                    <div className="w-px h-8 bg-hive-graphite" />
                    <button
                      type="button"
                      onClick={onShowPaths}
                      className="text-center hover:text-hive-yellow transition-colors"
                      aria-label="Vis stier funnet"
                    >
                      <motion.div
                        key={pathsFound}
                        initial={{ scale: 1.2 }}
                        animate={{ scale: 1 }}
                        className="text-lg sm:text-xl font-bold text-hive-yellow"
                      >
                        {pathsFound}
                      </motion.div>
                      <div className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">
                        Stier
                      </div>
                    </button>
                  </>
                )}

                {parValue && (
                  <>
                    <div className="w-px h-8 bg-hive-graphite" />
                    <div className="text-center">
                      <motion.div
                        key={parValue}
                        initial={{ scale: 1.2 }}
                        animate={{ scale: 1 }}
                        className="text-lg sm:text-xl font-bold text-hive-yellow"
                      >
                        {parValue}
                      </motion.div>
                      <div className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">
                        Par
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-4 justify-end">
              {/* Action buttons and other controls */}
              <div className="flex items-center gap-3 sm:gap-6">
                {/* Mode selector */}
                <div className="hidden md:flex items-center gap-2">
                  <div className="flex rounded-full bg-hive-graphite/70 p-1 text-xs">
                    {(["daily", "practice"] as PuzzleMode[]).map((option) => (
                      <button
                        key={option}
                        onClick={() => onModeChange(option)}
                        className={`px-3 py-1 rounded-full transition-colors ${
                          mode === option
                            ? "bg-hive-yellow text-hive-dark"
                            : "text-gray-300 hover:text-white"
                        }`}
                      >
                        {option === "daily" ? "Daglig" : "Øvelse"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conditional content based on mode - keeps position stable */}
                <div className="hidden sm:flex items-center gap-2 min-w-[200px] justify-end">
                  {isDaily ? (
                    onShowLeaderboard && (
                      <button
                        onClick={onShowLeaderboard}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-hive-yellow/10 text-hive-yellow hover:bg-hive-yellow/20 transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.8}
                            d="M8 21h8m-6 0v-5.586a1 1 0 00-.293-.707L5.414 11a2 2 0 01-.586-1.414V5a2 2 0 012-2h10a2 2 0 012 2v4.586a2 2 0 01-.586 1.414l-3.293 3.293a1 1 0 00-.293.707V21"
                          />
                        </svg>
                        <span className="text-sm font-medium">Ledertavle</span>
                      </button>
                    )
                  ) : (
                    <>
                      <select
                        value={difficulty}
                        onChange={(event) =>
                          onDifficultyChange(
                            event.target.value as PuzzleDifficulty,
                          )
                        }
                        className="bg-hive-graphite/70 border border-hive-graphite rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-hive-yellow/50"
                      >
                        {(["easy", "medium", "hard"] as PuzzleDifficulty[]).map(
                          (level) => (
                            <option key={level} value={level}>
                              {difficultyLabels[level]}
                            </option>
                          ),
                        )}
                      </select>
                      <button
                        onClick={() => {
                          void onGeneratePractice();
                        }}
                        disabled={isGeneratingPractice}
                        className="px-3 py-1.5 rounded-lg bg-hive-yellow text-hive-dark text-sm font-medium disabled:opacity-60 hover:bg-hive-gold transition-colors whitespace-nowrap"
                      >
                        {isGeneratingPractice ? "..." : "Nytt puslespill"}
                      </button>
                    </>
                  )}
                </div>

                <ShareButton
                  puzzleNumber={puzzleNumber}
                  wordsUsed={wordsUsed}
                  layers={layersExplored}
                  status={isComplete ? "won" : "playing"}
                  startWord={startWord}
                  goalWord={goalWord}
                  isDaily={isDaily}
                  difficulty={difficulty}
                  bestPath={bestPath}
                  pathsFound={pathsFound}
                  compact
                />
              </div>
            </div>
          </div>

          {/* Mobile Controls */}
          <div className="lg:hidden flex flex-col gap-2 mt-3 pt-3 border-t border-white/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 uppercase tracking-wide text-[10px]">
                  Modus
                </span>
                <div className="flex rounded-full bg-hive-graphite/70 p-1 text-xs">
                  {(["daily", "practice"] as PuzzleMode[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => onModeChange(option)}
                      className={`px-3 py-1 rounded-full transition-colors ${
                        mode === option
                          ? "bg-hive-yellow text-hive-dark"
                          : "text-gray-300 hover:text-white"
                      }`}
                    >
                      {option === "daily" ? "Daglig" : "Øvelse"}
                    </button>
                  ))}
                </div>
              </div>

              {mode === "practice" && (
                <div className="flex items-center gap-2">
                  <select
                    value={difficulty}
                    onChange={(event) =>
                      onDifficultyChange(event.target.value as PuzzleDifficulty)
                    }
                    className="bg-hive-graphite/70 border border-hive-graphite rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-hive-yellow/50"
                  >
                    {(["easy", "medium", "hard"] as PuzzleDifficulty[]).map(
                      (level) => (
                        <option key={level} value={level}>
                          {difficultyLabels[level]}
                        </option>
                      ),
                    )}
                  </select>
                  <button
                    onClick={() => {
                      void onGeneratePractice();
                    }}
                    disabled={isGeneratingPractice}
                    className="px-2 py-1 rounded-lg bg-hive-yellow text-hive-dark text-xs font-medium disabled:opacity-60 hover:bg-hive-gold transition-colors"
                  >
                    Ny
                  </button>
                </div>
              )}

              {isDaily && onShowLeaderboard && (
                <button
                  onClick={onShowLeaderboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hive-yellow/15 text-hive-yellow text-xs font-medium hover:bg-hive-yellow/25 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M8 21h8m-6 0v-5.586a1 1 0 00-.293-.707L5.414 11a2 2 0 01-.586-1.414V5a2 2 0 012-2h10a2 2 0 012 2v4.586a2 2 0 01-.586 1.414l-3.293 3.293a1 1 0 00-.293.707V21"
                    />
                  </svg>
                  Ledertavle
                </button>
              )}

              {pathsFound > 0 && (
                <button
                  type="button"
                  onClick={onShowPaths}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 text-xs font-medium hover:bg-green-500/25 transition-colors"
                >
                  {pathsFound} {pathsFound === 1 ? "sti" : "stier"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
