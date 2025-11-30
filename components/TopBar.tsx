'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MotionToggle } from './MotionToggle'
import ShareButton from './ShareButton'
import PlayerNameInput from './PlayerNameInput'
import { getPlayerStats } from '@/lib/player-id'
import type { PuzzleDifficulty, PuzzleMode } from '@/types'

interface TopBarProps {
  puzzleNumber?: number
  date?: string
  wordsUsed: number
  layersExplored: number
  pathsFound: number
  mode: PuzzleMode
  onModeChange: (mode: PuzzleMode) => void
  difficulty: PuzzleDifficulty
  onDifficultyChange: (difficulty: PuzzleDifficulty) => void
  onGeneratePractice: () => void
  isGeneratingPractice: boolean
  isDaily: boolean
  parValue?: number
  // Sharing props
  startWord: string
  goalWord: string
  startTime: number
  isComplete: boolean
  onShowLeaderboard?: () => void
}

const difficultyLabels: Record<PuzzleDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

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
  onShowLeaderboard,
}: TopBarProps) {
  const [currentStreak, setCurrentStreak] = useState(0)
  
  // Update streak when component mounts or when puzzle is completed
  useEffect(() => {
    const stats = getPlayerStats()
    setCurrentStreak(stats.currentStreak)
  }, [isComplete])
  
  // Format date for display
  const formattedDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-40"
      style={{ touchAction: 'pan-x pan-y' }}
    >
      <div className="bg-hive-dark/95 backdrop-blur-sm">
        <div className="w-full px-4 sm:px-6 py-3">
          <div className="relative flex items-center justify-between gap-4">
            {/* Left: Logo and puzzle info */}
            <div className="flex items-center gap-4 flex-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 relative">
                  <svg viewBox="0 0 32 32" className="w-full h-full">
                    <polygon
                      points="16,2 28,9 28,23 16,30 4,23 4,9"
                      fill="none"
                      stroke="#F4B400"
                      strokeWidth="2"
                      className="drop-shadow-lg"
                    />
                    <circle cx="16" cy="16" r="4" fill="#F4B400" />
                  </svg>
                </div>
                <h1 className="text-xl font-display font-bold text-gradient-gold hidden sm:block">
                  HiveLink
                </h1>
              </div>

              <div className="flex items-center gap-2 text-sm">
                {isDaily ? (
                  <>
                    <span className="bg-hive-graphite/80 px-3 py-1 rounded-full text-hive-yellow font-medium">
                      🐝 {currentStreak} day streak
                    </span>
                    <div className="flex md:hidden items-center gap-1.5">
                      <span className="text-gray-400">Hello,</span>
                      <PlayerNameInput className="text-sm" />
                    </div>
                  </>
                ) : (
                  <span className="bg-hive-yellow/10 text-hive-yellow px-3 py-1 rounded-full font-medium">
                    Practice
                  </span>
                )}
              </div>

              {/* Player Name and Date */}
              <div className="hidden md:flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400">Hello,</span>
                  <PlayerNameInput className="text-sm" />
                </div>
                
                {formattedDate && isDaily && (
                  <>
                    <span className="text-gray-500">·</span>
                    <span className="text-gray-400">{formattedDate}</span>
                  </>
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
                    Words
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
                    Layers
                  </div>
                </div>

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
                        Target
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
                    {(['daily', 'practice'] as PuzzleMode[]).map((option) => (
                      <button
                        key={option}
                        onClick={() => onModeChange(option)}
                        className={`px-3 py-1 rounded-full transition-colors ${
                          mode === option
                            ? 'bg-hive-yellow text-hive-dark'
                            : 'text-gray-300 hover:text-white'
                        }`}
                      >
                        {option === 'daily' ? 'Daily' : 'Practice'}
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
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.8}
                            d="M8 21h8m-6 0v-5.586a1 1 0 00-.293-.707L5.414 11a2 2 0 01-.586-1.414V5a2 2 0 012-2h10a2 2 0 012 2v4.586a2 2 0 01-.586 1.414l-3.293 3.293a1 1 0 00-.293.707V21"
                          />
                        </svg>
                        <span className="text-sm font-medium">Leaderboard</span>
                      </button>
                    )
                  ) : (
                    <>
                      <select
                        value={difficulty}
                        onChange={(event) => onDifficultyChange(event.target.value as PuzzleDifficulty)}
                        className="bg-hive-graphite/70 border border-hive-graphite rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-hive-yellow/50"
                      >
                        {(['easy', 'medium', 'hard'] as PuzzleDifficulty[]).map((level) => (
                          <option key={level} value={level}>
                            {difficultyLabels[level]}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          void onGeneratePractice()
                        }}
                        disabled={isGeneratingPractice}
                        className="px-3 py-1.5 rounded-lg bg-hive-yellow text-hive-dark text-sm font-medium disabled:opacity-60 hover:bg-hive-gold transition-colors whitespace-nowrap"
                      >
                        {isGeneratingPractice ? '...' : 'New Puzzle'}
                      </button>
                    </>
                  )}
                </div>

                <ShareButton
                  puzzleNumber={puzzleNumber}
                  wordsUsed={wordsUsed}
                  layers={layersExplored}
                  status={isComplete ? 'won' : 'playing'}
                  startWord={startWord}
                  goalWord={goalWord}
                  isDaily={isDaily}
                  difficulty={difficulty}
                  compact
                />
              </div>
            </div>
          </div>

          {/* Mobile Controls */}
          <div className="lg:hidden flex flex-col gap-2 mt-3 pt-3 border-t border-white/5">
            <div className="flex items-center justify-between gap-3">
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 bg-hive-charcoal/80 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-hive-yellow/30 shadow-sm"
              >
                <div className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Start</div>
                <div className="text-sm font-bold text-hive-yellow leading-none truncate">{startWord}</div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex-1 bg-hive-charcoal/80 backdrop-blur-sm rounded-lg px-3 py-1.5 border shadow-sm text-right
                           ${isComplete ? 'border-green-500/50' : 'border-hive-graphite/60'}`}
              >
                <div className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Goal</div>
                <div className={`text-sm font-bold leading-none truncate ${isComplete ? 'text-green-400' : 'text-white'}`}>
                  {goalWord}
                </div>
              </motion.div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 uppercase tracking-wide text-[10px]">Mode</span>
                <div className="flex rounded-full bg-hive-graphite/70 p-1 text-xs">
                  {(['daily', 'practice'] as PuzzleMode[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => onModeChange(option)}
                      className={`px-3 py-1 rounded-full transition-colors ${
                        mode === option
                          ? 'bg-hive-yellow text-hive-dark'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      {option === 'daily' ? 'Daily' : 'Practice'}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'practice' && (
                <div className="flex items-center gap-2">
                  <select
                    value={difficulty}
                    onChange={(event) => onDifficultyChange(event.target.value as PuzzleDifficulty)}
                    className="bg-hive-graphite/70 border border-hive-graphite rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-hive-yellow/50"
                  >
                    {(['easy', 'medium', 'hard'] as PuzzleDifficulty[]).map((level) => (
                      <option key={level} value={level}>
                        {difficultyLabels[level]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      void onGeneratePractice()
                    }}
                    disabled={isGeneratingPractice}
                    className="px-2 py-1 rounded-lg bg-hive-yellow text-hive-dark text-xs font-medium disabled:opacity-60 hover:bg-hive-gold transition-colors"
                  >
                    New
                  </button>
                </div>
              )}

              {isDaily && onShowLeaderboard && (
                <button
                  onClick={onShowLeaderboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hive-yellow/15 text-hive-yellow text-xs font-medium hover:bg-hive-yellow/25 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M8 21h8m-6 0v-5.586a1 1 0 00-.293-.707L5.414 11a2 2 0 01-.586-1.414V5a2 2 0 012-2h10a2 2 0 012 2v4.586a2 2 0 01-.586 1.414l-3.293 3.293a1 1 0 00-.293.707V21"
                    />
                  </svg>
                  Leaderboard
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  )
}

