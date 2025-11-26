import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// Cache the puzzle for 5 minutes to reduce database load
let cachedPuzzle: {
  data: {
    id: number
    puzzleNumber: number
    date: string
    startWord: string
    goalWord: string
    optimalSteps: number | null
  } | null
  timestamp: number
} | null = null

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

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

    // Fetch today's puzzle
    const puzzle = await prisma.dailyPuzzle.findUnique({
      where: {
        date: today,
      },
    })

    if (!puzzle) {
      // Fallback: get the most recent puzzle
      const latestPuzzle = await prisma.dailyPuzzle.findFirst({
        orderBy: {
          date: 'desc',
        },
      })

      if (!latestPuzzle) {
        // No puzzles at all - return a default
        return NextResponse.json({
          success: true,
          data: {
            id: 0,
            puzzleNumber: 1,
            date: today.toISOString().split('T')[0],
            startWord: 'butterfly',
            goalWord: 'moonshine',
            optimalSteps: 6,
          },
        })
      }

      // Calculate puzzle number based on days since first puzzle
      const firstPuzzle = await prisma.dailyPuzzle.findFirst({
        orderBy: {
          date: 'asc',
        },
      })

      const firstDate = firstPuzzle?.date || latestPuzzle.date
      const daysDiff = Math.floor(
        (today.getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24)
      )

      const responseData = {
        id: latestPuzzle.id,
        puzzleNumber: daysDiff + 1,
        date: latestPuzzle.date.toISOString().split('T')[0],
        startWord: latestPuzzle.startWord,
        goalWord: latestPuzzle.goalWord,
        optimalSteps: latestPuzzle.optimalSteps,
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
    }

    // Calculate puzzle number
    const firstPuzzle = await prisma.dailyPuzzle.findFirst({
      orderBy: {
        date: 'asc',
      },
    })

    const firstDate = firstPuzzle?.date || puzzle.date
    const daysDiff = Math.floor(
      (today.getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24)
    )

    const responseData = {
      id: puzzle.id,
      puzzleNumber: daysDiff + 1,
      date: puzzle.date.toISOString().split('T')[0],
      startWord: puzzle.startWord,
      goalWord: puzzle.goalWord,
      optimalSteps: puzzle.optimalSteps,
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
    const today = new Date().toISOString().split('T')[0]
    return NextResponse.json({
      success: true,
      data: {
        id: 0,
        puzzleNumber: 1,
        date: today,
        startWord: 'butterfly',
        goalWord: 'moonshine',
        optimalSteps: 6,
      },
    })
  }
}

