import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { generateDailyPuzzle } from '@/lib/puzzle-generator'

// Cache the puzzle for 5 minutes to reduce database load
type CachedDailyPuzzle = {
  id: number
  puzzleNumber: number
  date: string
  startWord: string
  goalWord: string
  optimalSteps: number
  isDaily: true
  mode: 'daily'
  startParts?: string[]
  goalParts?: string[]
  wordParts?: Record<string, string[]>
}

type CacheEntry = {
  data: CachedDailyPuzzle
  timestamp: number
}

const puzzleCache = new Map<string, CacheEntry>()

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Calculate puzzle number based on a fixed epoch date
function calculatePuzzleNumber(date: Date): number {
  // Epoch: November 27, 2024 - Puzzle #1
  const epochDate = new Date('2024-11-27T00:00:00Z')
  const daysDiff = Math.floor(
    (date.getTime() - epochDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  return Math.max(1, daysDiff + 1)
}

function resolveTimeZone(value: string | null): string {
  if (!value) return 'UTC'
  try {
    // Throws if the time zone identifier is invalid
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return value
  } catch (error) {
    console.warn(`Invalid timezone "${value}", falling back to UTC`)
    return 'UTC'
  }
}

async function loadWordEntries() {
  const dbWords = await prisma.compoundWord.findMany({
    select: { word: true, parts: true },
  })

  return dbWords.map(({ word, parts }) => ({
    word,
    parts,
  }))
}

async function loadWordParts(words: string[]): Promise<{
  startParts?: string[]
  goalParts?: string[]
  wordParts: Record<string, string[]>
}> {
  const normalizedWords = words.map(w => w.toLowerCase())
  
  const dbParts = await prisma.compoundWord.findMany({
    where: {
      word: {
        in: normalizedWords,
      },
    },
    select: { word: true, parts: true },
  })

  const wordParts: Record<string, string[]> = {}
  for (const entry of dbParts) {
    wordParts[entry.word.toLowerCase()] = entry.parts
  }

  const startParts = wordParts[normalizedWords[0]]
  const goalParts = wordParts[normalizedWords[1]]

  return { startParts, goalParts, wordParts }
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

function parseIsoDate(dateStr: string): Date | null {
  const parts = dateStr.split('-')
  if (parts.length !== 3) {
    return null
  }

  const [yearStr, monthStr, dayStr] = parts
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day))
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null
  }

  return utcDate
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedTimeZone = resolveTimeZone(searchParams.get('timezone'))
    const clientDateClaim = searchParams.get('date')

    const now = new Date()
    const localDateStr = formatDateInTimeZone(now, requestedTimeZone)

    if (clientDateClaim && clientDateClaim > localDateStr) {
      return NextResponse.json(
        {
          success: false,
          error: 'Daily puzzle is not available yet in your timezone.',
        },
        { status: 409 }
      )
    }

    const targetDate = parseIsoDate(localDateStr)
    if (!targetDate) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unable to determine the local date for your timezone.',
        },
        { status: 500 }
      )
    }

    const targetDateKey = localDateStr
    const cached = puzzleCache.get(targetDateKey)
    const timestampNow = Date.now()

    if (cached && (timestampNow - cached.timestamp) < CACHE_DURATION) {
      const cachedWords = [cached.data.startWord.toLowerCase(), cached.data.goalWord.toLowerCase()]
      const knownWords = await prisma.compoundWord.findMany({
        where: {
          word: {
            in: cachedWords,
          },
        },
        select: { word: true },
      })

      if (knownWords.length === 2) {
        return NextResponse.json({
          success: true,
          data: cached.data,
        })
      }

      puzzleCache.delete(targetDateKey)
    }

    // Check cache
    // Fetch today's puzzle
    let puzzle = await prisma.dailyPuzzle.findUnique({
      where: {
        date: targetDate,
      },
    })

    // If no puzzle exists for today, generate one automatically
    if (!puzzle) {
      console.log(`No puzzle found for ${targetDateKey}, generating one...`)
      
      try {
        // Generate a medium difficulty puzzle for the daily
        const wordEntries = await loadWordEntries()

        if (wordEntries.length === 0) {
          throw new Error('Compound word table is empty; cannot generate daily puzzle')
        }

        const generated = await generateDailyPuzzle(targetDate, { wordEntries })
        
        // Use upsert to handle race conditions
        puzzle = await prisma.dailyPuzzle.upsert({
          where: { date: targetDate },
          update: {}, // Don't update if exists
          create: {
            date: targetDate,
            startWord: generated.startWord,
            goalWord: generated.goalWord,
            optimalSteps: generated.optimalSteps,
          },
        })
        
        console.log(`Daily puzzle for ${targetDateKey}: ${puzzle.startWord} -> ${puzzle.goalWord}`)
      } catch (genError) {
        console.error('Failed to generate daily puzzle:', genError)
        
        // Try to fetch again in case of race condition
        puzzle = await prisma.dailyPuzzle.findUnique({
          where: { date: targetDate },
        })
        
        if (!puzzle) {
          // Return a fallback puzzle
          const puzzleNumber = calculatePuzzleNumber(targetDate)
          return NextResponse.json({
            success: true,
            data: {
              id: 0,
              puzzleNumber,
              date: targetDateKey,
              startWord: 'butterfly',
              goalWord: 'moonshine',
              optimalSteps: 6,
              isDaily: true,
              mode: 'daily',
              startParts: ['butter', 'fly'],
              goalParts: ['moon', 'shine'],
              wordParts: {
                butterfly: ['butter', 'fly'],
                moonshine: ['moon', 'shine'],
              },
            },
          })
        }
      }
    }

    if (puzzle) {
      const wordsToCheck = [puzzle.startWord.toLowerCase(), puzzle.goalWord.toLowerCase()]
      const knownWords = await prisma.compoundWord.findMany({
        where: {
          word: {
            in: wordsToCheck,
          },
        },
        select: { word: true },
      })

      if (knownWords.length < 2) {
        console.warn(`Daily puzzle ${targetDateKey} uses words missing from database, regenerating...`)

        const wordEntries = await loadWordEntries()

        if (wordEntries.length === 0) {
          throw new Error('Compound word table is empty; cannot regenerate daily puzzle')
        }

        const regenerated = await generateDailyPuzzle(targetDate, { wordEntries })

        puzzle = await prisma.dailyPuzzle.update({
          where: { date: targetDate },
          data: {
            startWord: regenerated.startWord,
            goalWord: regenerated.goalWord,
            optimalSteps: regenerated.optimalSteps,
          },
        })
      }
    }

    const puzzleNumber = calculatePuzzleNumber(targetDate)

    // Load the word parts for start and goal words
    const { startParts, goalParts, wordParts } = await loadWordParts([
      puzzle.startWord,
      puzzle.goalWord,
    ])

    const responseData: CachedDailyPuzzle = {
      id: puzzle.id,
      puzzleNumber,
      date: puzzle.date.toISOString().split('T')[0],
      startWord: puzzle.startWord,
      goalWord: puzzle.goalWord,
      optimalSteps: puzzle.optimalSteps ?? 6,
      isDaily: true,
      mode: 'daily',
      startParts,
      goalParts,
      wordParts,
    }

    // Update cache
    puzzleCache.set(targetDateKey, {
      data: responseData,
      timestamp: timestampNow,
    })

    return NextResponse.json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error('Error fetching today\'s puzzle:', error)

    // Return a fallback puzzle on error
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]
    const puzzleNumber = calculatePuzzleNumber(today)
    
    return NextResponse.json({
      success: true,
      data: {
        id: 0,
        puzzleNumber,
        date: todayStr,
        startWord: 'butterfly',
        goalWord: 'moonshine',
        optimalSteps: 6,
        isDaily: true,
        mode: 'daily',
        startParts: ['butter', 'fly'],
        goalParts: ['moon', 'shine'],
        wordParts: {
          butterfly: ['butter', 'fly'],
          moonshine: ['moon', 'shine'],
        },
      },
    })
  }
}

