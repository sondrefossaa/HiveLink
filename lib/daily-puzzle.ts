// lib/daily-puzzle.ts
// Client-safe daily puzzle resolution. Prefers the bundled, pre-generated
// data/daily-puzzles.json (pins puzzles even if the dictionary changes),
// and falls back to deterministic date-seeded generation in the browser.

import dailyPuzzlesJson from '@/data/daily-puzzles.json'
import { generateDailyPuzzle } from '@/lib/puzzle-generator'
import type { DailyPuzzle } from '@/types'

interface StoredDailyPuzzle {
  dictionaryVersion: 3
  tierPolicyVersion: 2
  tier: 'medium'
  startWord: string
  goalWord: string
  parSteps: number
  absoluteOptimalSteps?: number
  solutionPath: string[]
  solutionAnalysisIds: number[]
}

const BUNDLED_DAILY_PUZZLES = dailyPuzzlesJson as unknown as Record<string, StoredDailyPuzzle>

// Epoch: November 27, 2024 - Puzzle #1
const PUZZLE_EPOCH_UTC_MS = Date.UTC(2024, 10, 27)
const MS_PER_DAY = 1000 * 60 * 60 * 24

export function calculatePuzzleNumber(dateKey: string): number {
  const date = new Date(`${dateKey}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    return 1
  }
  const daysDiff = Math.floor((date.getTime() - PUZZLE_EPOCH_UTC_MS) / MS_PER_DAY)
  return Math.max(1, daysDiff + 1)
}

export function getStoredDailyPuzzle(dateKey: string): StoredDailyPuzzle | null {
  const stored = BUNDLED_DAILY_PUZZLES[dateKey]
  if (
    !stored ||
    typeof stored.startWord !== 'string' ||
    typeof stored.goalWord !== 'string' ||
    typeof stored.parSteps !== 'number' ||
    stored.dictionaryVersion !== 3 ||
    stored.tierPolicyVersion !== 2 ||
    stored.tier !== 'medium' ||
    !Array.isArray(stored.solutionPath)
    || !Array.isArray(stored.solutionAnalysisIds)
  ) {
    return null
  }
  return stored
}

function buildDailyPuzzle(
  dateKey: string,
  puzzle: { startWord: string; goalWord: string; parSteps: number; absoluteOptimalSteps?: number; solutionPath?: string[]; solutionAnalysisIds?: number[] }
): DailyPuzzle {
  const startWord = puzzle.startWord.toLowerCase()
  const goalWord = puzzle.goalWord.toLowerCase()

  // Start and goal are simple words (single part = the word itself).
  // If they exist in the compound dictionary, use their stored parts.
  const startParts = [startWord]
  const goalParts = [goalWord]

  const wordParts: Record<string, string[]> = {}

  return {
    id: 0,
    puzzleNumber: calculatePuzzleNumber(dateKey),
    date: dateKey,
    startWord,
    goalWord,
    parSteps: puzzle.parSteps,
    absoluteOptimalSteps: puzzle.absoluteOptimalSteps,
    isDaily: true,
    mode: 'daily',
    startParts,
    goalParts,
    wordParts,
    solutionPath: puzzle.solutionPath ? [...puzzle.solutionPath] : undefined,
    solutionAnalysisIds: puzzle.solutionAnalysisIds ? [...puzzle.solutionAnalysisIds] : undefined,
  }
}

/**
 * Resolve the daily puzzle for a local date key (YYYY-MM-DD).
 * Deterministic: the same date always yields the same puzzle.
 */
export async function getDailyPuzzle(dateKey: string): Promise<DailyPuzzle> {
  const stored = getStoredDailyPuzzle(dateKey)
  if (stored) {
    return buildDailyPuzzle(dateKey, stored)
  }

  try {
    const utcDate = new Date(`${dateKey}T00:00:00Z`)
    if (Number.isNaN(utcDate.getTime())) {
      throw new Error(`Invalid date key: ${dateKey}`)
    }

    const generated = await generateDailyPuzzle(utcDate)
    return buildDailyPuzzle(dateKey, generated)
  } catch (error) {
    console.error(`Failed to generate daily puzzle for ${dateKey}:`, error)
    // Deterministic fallback so the game stays playable
    return buildDailyPuzzle(dateKey, {
      startWord: 'fot',
      goalWord: 'stol',
      parSteps: 4,
    })
  }
}
