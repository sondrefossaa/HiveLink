import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import type { LeaderboardEntry, LeaderboardResponse, AverageStats } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const playerId = searchParams.get('playerId')

    // Get today's date
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const [allScores, puzzle, aggregates] = await Promise.all([
      prisma.score.findMany({
        where: {
          puzzleDate: today,
          isDaily: true,
        },
      }),
      prisma.dailyPuzzle.findUnique({
        where: {
          date: today,
        },
      }),
      prisma.score.aggregate({
        where: {
          puzzleDate: today,
          isDaily: true,
        },
        _avg: {
          wordsUsed: true,
          layers: true,
          timeElapsed: true,
        },
        _count: true,
      }),
    ])

    const par = puzzle?.optimalSteps ?? 999

    const rankScores = [...allScores].sort((a, b) => {
      const safeValue = (words: number) => (words <= par ? words : 999)
      const aScore = safeValue(a.wordsUsed)
      const bScore = safeValue(b.wordsUsed)

      if (aScore !== bScore) return aScore - bScore
      if (a.layers !== b.layers) return a.layers - b.layers
      return a.finishedAt.getTime() - b.finishedAt.getTime()
    })

    const leaderboardScores = rankScores.slice(0, 100)
    const totalPlayers = rankScores.length

    // Map to leaderboard entries
    const entries: LeaderboardEntry[] = leaderboardScores.map((score, index) => ({
      rank: index + 1,
      playerId: score.playerId.substring(0, 8) + '...', // Anonymize
      wordsUsed: score.wordsUsed,
      layers: score.layers,
      finishedAt: score.finishedAt.toISOString(),
    }))

    const response: LeaderboardResponse = {
      entries,
      totalPlayers,
      averageStats: {
        avgWordsUsed: aggregates._avg.wordsUsed ?? 0,
        avgLayers: aggregates._avg.layers ?? 0,
        avgTimeElapsed: aggregates._avg.timeElapsed ?? null,
        totalPlayers,
      },
    }

    // If player ID provided, find their rank
    if (playerId) {
      const playerIndex = rankScores.findIndex((score) => score.playerId === playerId)
      if (playerIndex >= 0) {
        response.playerRank = playerIndex + 1
        if (totalPlayers > 0) {
          response.playerPercentile = Math.round(
            ((totalPlayers - playerIndex) / totalPlayers) * 100
          )
        }
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

