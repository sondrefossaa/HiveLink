// scripts/regenerate-daily.ts
// Pre-generate daily puzzles into data/daily-puzzles.json.
// The app falls back to deterministic in-browser generation for any missing date,
// so pre-generation mainly pins puzzles and avoids first-load generation cost.
//
// Usage:
//   npm run data:puzzles                # fill from today (UTC) through +370 days
//   npm run data:puzzles -- --days 30   # generate fewer days
//   npm run data:puzzles -- --start 2026-09-01 --days 14
//   npm run data:puzzles -- --force     # regenerate existing dates too

import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateDailyPuzzle } from '@lib/puzzle-generator'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, '..', 'data', 'daily-puzzles.json')

interface StoredDailyPuzzle {
  dictionaryVersion: 2
  tierPolicyVersion: 1
  tier: 'medium'
  startWord: string
  goalWord: string
  parSteps: number
  absoluteOptimalSteps?: number
  solutionPath: string[]
  solutionAnalysisIds: number[]
}

function toUtcDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

function parseDateKey(value: string): Date | null {
  const utcDate = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(utcDate.getTime()) || toUtcDateKey(utcDate) !== value) {
    return null
  }
  return utcDate
}

async function main() {
  const args = process.argv.slice(2)
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] : undefined
  }

  const days = Math.max(1, Number(getArg('--days') ?? 370) || 370)
  const force = args.includes('--force')
  const startArg = getArg('--start')

  const startDate = startArg ? parseDateKey(startArg) : new Date(`${toUtcDateKey(new Date())}T00:00:00Z`)
  if (!startDate) {
    console.error(`Invalid --start value: ${startArg}. Use YYYY-MM-DD.`)
    process.exit(1)
  }

  let stored: Record<string, StoredDailyPuzzle> = {}
  try {
    const raw = await readFile(DATA_FILE, 'utf-8')
    stored = JSON.parse(raw)
    console.log(`Loaded existing daily-puzzles.json (${Object.keys(stored).length} dates)`)
  } catch {
    console.log('No existing daily-puzzles.json, starting fresh')
  }

  let generated = 0
  let skipped = 0
  let failed = 0

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const date = new Date(startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000)
    const dateKey = toUtcDateKey(date)

    if (!force && stored[dateKey]?.dictionaryVersion === 2) {
      skipped++
      continue
    }

    try {
      const puzzle = await generateDailyPuzzle(date)
      stored[dateKey] = {
        dictionaryVersion: 2,
        tierPolicyVersion: 1,
        tier: 'medium',
        startWord: puzzle.startWord,
        goalWord: puzzle.goalWord,
        parSteps: puzzle.parSteps,
        absoluteOptimalSteps: puzzle.absoluteOptimalSteps,
        solutionPath: puzzle.solutionPath,
        solutionAnalysisIds: puzzle.solutionAnalysisIds,
      }
      generated++
      console.log(`${dateKey}: ${puzzle.startWord} -> ${puzzle.goalWord} (par ${puzzle.parSteps})`)
    } catch (error) {
      failed++
      console.warn(`${dateKey}: generation failed (${error instanceof Error ? error.message : error})`)
    }
  }

  // Write sorted by date for stable diffs
  const sorted: Record<string, StoredDailyPuzzle> = {}
  for (const key of Object.keys(stored).sort()) {
    sorted[key] = stored[key]
  }

  await writeFile(DATA_FILE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8')
  console.log(`\n✓ Wrote ${Object.keys(sorted).length} daily puzzles to data/daily-puzzles.json`)
  console.log(`  Generated: ${generated}, skipped existing: ${skipped}, failed: ${failed}`)
}

main()
