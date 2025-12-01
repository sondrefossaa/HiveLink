import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { generateDailyPuzzle } from '@/lib/puzzle-generator'

// This endpoint generates daily puzzles for the next 7 days
// It's designed to be called by a Vercel cron job

export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron job request (optional security)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
      // Allow without auth in development, require in production if CRON_SECRET is set
      if (process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Check for force parameter to regenerate existing puzzles
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    const results: { date: string; status: string; puzzle?: string }[] = []
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const dbWords = await prisma.compoundWord.findMany({
      select: { word: true, parts: true },
    })
    const wordEntries = dbWords.map(({ word, parts }) => ({
      word,
      parts,
    }))

    if (wordEntries.length === 0) {
      throw new Error('Compound word table is empty; unable to generate daily puzzles')
    }

    // Generate puzzles for today and the next 7 days
    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(today)
      targetDate.setUTCDate(targetDate.getUTCDate() + i)
      const dateStr = targetDate.toISOString().split('T')[0]

      // Check if puzzle already exists
      const existing = await prisma.dailyPuzzle.findUnique({
        where: { date: targetDate },
      })

      if (existing && !force) {
        results.push({
          date: dateStr,
          status: 'exists',
          puzzle: `${existing.startWord} -> ${existing.goalWord}`,
        })
        continue
      }

      // Generate new puzzle (or regenerate if force=true)
      try {
        const generated = await generateDailyPuzzle(targetDate, {
          wordEntries,
          minSteps: 3,
        })
        
        const puzzle = existing && force
          ? await prisma.dailyPuzzle.update({
              where: { date: targetDate },
              data: {
                startWord: generated.startWord,
                goalWord: generated.goalWord,
                optimalSteps: generated.optimalSteps,
              },
            })
          : await prisma.dailyPuzzle.create({
              data: {
                date: targetDate,
                startWord: generated.startWord,
                goalWord: generated.goalWord,
                optimalSteps: generated.optimalSteps,
              },
            })

        results.push({
          date: dateStr,
          status: existing && force ? 'regenerated' : 'created',
          puzzle: `${puzzle.startWord} -> ${puzzle.goalWord}`,
        })
      } catch (genError) {
        console.error(`Failed to generate puzzle for ${dateStr}:`, genError)
        results.push({
          date: dateStr,
          status: 'failed',
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Daily puzzle generation complete',
      results,
    })
  } catch (error) {
    console.error('Error in daily puzzle cron:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate puzzles' },
      { status: 500 }
    )
  }
}
