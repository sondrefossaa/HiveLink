import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// Rate limiting map: playerId -> last submission timestamp
const submissionTimestamps = new Map<string, number>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playerId, playerName, wordsUsed, layers, puzzleDate, isDaily = true, pathsFound = 1 } = body

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

    const now = Date.now()

    // Check if player already submitted for this puzzle
    const existingScore = await prisma.score.findUnique({
      where: {
        puzzleDate_playerId: {
          puzzleDate: date,
          playerId,
        },
      },
    })

    // Rate limiting - only for new submissions, not updates
    if (!existingScore) {
      const lastSubmission = submissionTimestamps.get(playerId)
      if (lastSubmission && (now - lastSubmission) < RATE_LIMIT_WINDOW) {
        return NextResponse.json(
          { success: false, error: 'Please wait before submitting again' },
          { status: 429 }
        )
      }
    }

    if (existingScore) {
      // Update if the new score is better (fewer words) OR if paths found increased
      const isBetterScore = wordsUsed < existingScore.wordsUsed
      const hasMorePaths = pathsFound > existingScore.pathsFound
      const isSameScoreMorePaths = wordsUsed === existingScore.wordsUsed && hasMorePaths
      
      console.log('Score update check:', {
        existingWordsUsed: existingScore.wordsUsed,
        newWordsUsed: wordsUsed,
        existingPathsFound: existingScore.pathsFound,
        newPathsFound: pathsFound,
        isBetterScore,
        hasMorePaths,
        isSameScoreMorePaths,
      })
      
      if (isBetterScore || isSameScoreMorePaths) {
        const updatedScore = await prisma.score.update({
          where: {
            id: existingScore.id,
          },
          data: {
            wordsUsed,
            layers,
            pathsFound: typeof pathsFound === 'number' ? pathsFound : 1,
            finishedAt: new Date(),
            isDaily: true,
            playerName: playerName || existingScore.playerName,
          },
        })

        // Don't update timestamp on updates, only on initial submission

        return NextResponse.json({
          success: true,
          data: {
            id: updatedScore.id,
            wordsUsed: updatedScore.wordsUsed,
            layers: updatedScore.layers,
            pathsFound: updatedScore.pathsFound,
            isNewBest: isBetterScore,
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
          pathsFound: existingScore.pathsFound,
          isNewBest: false,
        },
      })
    }

    // Create new score
    const newScore = await prisma.score.create({
      data: {
        puzzleDate: date,
        playerId,
        playerName: playerName || null,
        wordsUsed,
        layers,
        pathsFound: typeof pathsFound === 'number' ? pathsFound : 1,
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
        pathsFound: newScore.pathsFound,
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

