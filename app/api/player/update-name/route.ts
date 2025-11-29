import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playerId, playerName } = body

    // Validate input
    if (!playerId || typeof playerId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Player ID is required' },
        { status: 400 }
      )
    }

    if (!playerName || typeof playerName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Player name is required' },
        { status: 400 }
      )
    }

    // Validate name length and characters
    const trimmedName = playerName.trim()
    if (trimmedName.length === 0 || trimmedName.length > 20) {
      return NextResponse.json(
        { success: false, error: 'Name must be between 1 and 20 characters' },
        { status: 400 }
      )
    }

    if (!/^[a-zA-Z0-9_\s-]+$/.test(trimmedName)) {
      return NextResponse.json(
        { success: false, error: 'Invalid characters in name' },
        { status: 400 }
      )
    }

    // Update all scores for this player
    const result = await prisma.score.updateMany({
      where: {
        playerId: playerId,
      },
      data: {
        playerName: trimmedName,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        updatedCount: result.count,
      },
    })
  } catch (error) {
    console.error('Error updating player name:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update player name' },
      { status: 500 }
    )
  }
}
