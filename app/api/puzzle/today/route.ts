import { NextResponse } from 'next/server'
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
}

let cachedPuzzle: {
  data: CachedDailyPuzzle | null
  timestamp: number
} | null = null

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

export async function GET() {
  try {
    // Check cache
    const now = Date.now()
    if (cachedPuzzle && (now - cachedPuzzle.timestamp) < CACHE_DURATION) {
      // Verify it's still today's puzzle
      const today = new Date().toISOString().split('T')[0]
      if (cachedPuzzle.data?.date === today) {
        return NextResponse.json({
          success: true,
          data: cachedPuzzle.data,
        })
      }
    }

    // Get today's date in UTC
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    // Fetch today's puzzle
    let puzzle = await prisma.dailyPuzzle.findUnique({
      where: {
        date: today,
      },
    })

    // If no puzzle exists for today, generate one automatically
    if (!puzzle) {
      console.log(`No puzzle found for ${todayStr}, generating one...`)
      
      try {
        // Generate a medium difficulty puzzle for the daily
        const generated = await generateDailyPuzzle(today)
        
        // Use upsert to handle race conditions
        puzzle = await prisma.dailyPuzzle.upsert({
          where: { date: today },
          update: {}, // Don't update if exists
          create: {
            date: today,
            startWord: generated.startWord,
            goalWord: generated.goalWord,
            optimalSteps: generated.optimalSteps,
          },
        })
        
        console.log(`Daily puzzle for ${todayStr}: ${puzzle.startWord} -> ${puzzle.goalWord}`)
      } catch (genError) {
        console.error('Failed to generate daily puzzle:', genError)
        
        // Try to fetch again in case of race condition
        puzzle = await prisma.dailyPuzzle.findUnique({
          where: { date: today },
        })
        
        if (!puzzle) {
          // Return a fallback puzzle
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
            },
          })
        }
      }
    }

    const puzzleNumber = calculatePuzzleNumber(today)

    const responseData: CachedDailyPuzzle = {
      id: puzzle.id,
      puzzleNumber,
      date: puzzle.date.toISOString().split('T')[0],
      startWord: puzzle.startWord,
      goalWord: puzzle.goalWord,
      optimalSteps: puzzle.optimalSteps ?? 6,
      isDaily: true,
      mode: 'daily',
    }

    // Update cache
    cachedPuzzle = {
      data: responseData,
      timestamp: now,
    }

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
      },
    })
  }
}

