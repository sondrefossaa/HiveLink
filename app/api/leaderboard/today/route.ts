import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import type { LeaderboardEntry, LeaderboardResponse } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const playerId = searchParams.get('playerId')

    // Get today's date
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    // Fetch top 100 scores for today
    const scores = await prisma.score.findMany({
      where: {
        puzzleDate: today,
      },
      orderBy: [
        { wordsUsed: 'asc' },
        { layers: 'asc' },
        { finishedAt: 'asc' },
      ],
      take: 100,
    })

    // Get total player count for today
    const totalPlayers = await prisma.score.count({
      where: {
        puzzleDate: today,
      },
    })

    // Map to leaderboard entries
    const entries: LeaderboardEntry[] = scores.map((score, index) => ({
      rank: index + 1,
      playerId: score.playerId.substring(0, 8) + '...', // Anonymize
      wordsUsed: score.wordsUsed,
      layers: score.layers,
      finishedAt: score.finishedAt.toISOString(),
    }))

    const response: LeaderboardResponse = {
      entries,
      totalPlayers,
    }

    // If player ID provided, find their rank
    if (playerId) {
      const playerScore = await prisma.score.findUnique({
        where: {
          puzzleDate_playerId: {
            puzzleDate: today,
            playerId,
          },
        },
      })

      if (playerScore) {
        // Count how many players have a better score
        const betterScores = await prisma.score.count({
          where: {
            puzzleDate: today,
            OR: [
              { wordsUsed: { lt: playerScore.wordsUsed } },
              {
                wordsUsed: playerScore.wordsUsed,
                layers: { lt: playerScore.layers },
              },
              {
                wordsUsed: playerScore.wordsUsed,
                layers: playerScore.layers,
                finishedAt: { lt: playerScore.finishedAt },
              },
            ],
          },
        })

        response.playerRank = betterScores + 1
        response.playerPercentile = Math.round(
          ((totalPlayers - betterScores) / totalPlayers) * 100
        )
      }
    }

    return NextResponse.json({
      success: true,
      data: response,
    })
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch leaderboard',
      },
      { status: 500 }
    )
  }
}

