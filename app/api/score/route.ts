import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// Rate limiting map: playerId -> last submission timestamp
const submissionTimestamps = new Map<string, number>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playerId, wordsUsed, layers, puzzleDate, isDaily = true } = body

    // Validate input
    if (!playerId || typeof playerId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Player ID is required' },
        { status: 400 }
      )
    }

    if (typeof wordsUsed !== 'number' || wordsUsed < 1) {
      return NextResponse.json(
        { success: false, error: 'Invalid words used count' },
        { status: 400 }
      )
    }

    if (typeof layers !== 'number' || layers < 1) {
      return NextResponse.json(
        { success: false, error: 'Invalid layers count' },
        { status: 400 }
      )
    }

    if (!isDaily) {
      return NextResponse.json(
        { success: false, error: 'Practice scores are not tracked' },
        { status: 400 }
      )
    }

    // Parse puzzle date
    let date: Date
    if (puzzleDate) {
      date = new Date(puzzleDate)
    } else {
      date = new Date()
    }
    date.setUTCHours(0, 0, 0, 0)

    // Rate limiting
    const lastSubmission = submissionTimestamps.get(playerId)
    const now = Date.now()
    if (lastSubmission && (now - lastSubmission) < RATE_LIMIT_WINDOW) {
      return NextResponse.json(
        { success: false, error: 'Please wait before submitting again' },
        { status: 429 }
      )
    }

    // Check if player already submitted for this puzzle
    const existingScore = await prisma.score.findUnique({
      where: {
        puzzleDate_playerId: {
          puzzleDate: date,
          playerId,
        },
      },
    })

    if (existingScore) {
      // Update only if the new score is better (fewer words)
      if (wordsUsed < existingScore.wordsUsed) {
        const updatedScore = await prisma.score.update({
          where: {
            id: existingScore.id,
          },
          data: {
            wordsUsed,
            layers,
            finishedAt: new Date(),
            isDaily: true,
          },
        })

        submissionTimestamps.set(playerId, now)

        return NextResponse.json({
          success: true,
          data: {
            id: updatedScore.id,
            wordsUsed: updatedScore.wordsUsed,
            layers: updatedScore.layers,
            isNewBest: true,
          },
        })
      }

      // Return existing score
      return NextResponse.json({
        success: true,
        data: {
          id: existingScore.id,
          wordsUsed: existingScore.wordsUsed,
          layers: existingScore.layers,
          isNewBest: false,
        },
      })
    }

    // Create new score
    const newScore = await prisma.score.create({
      data: {
        puzzleDate: date,
        playerId,
        wordsUsed,
        layers,
        isDaily: true,
      },
    })

    submissionTimestamps.set(playerId, now)

    return NextResponse.json({
      success: true,
      data: {
        id: newScore.id,
        wordsUsed: newScore.wordsUsed,
        layers: newScore.layers,
        isNewBest: true,
      },
    })
  } catch (error) {
    console.error('Error submitting score:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to submit score' },
      { status: 500 }
    )
  }
}

