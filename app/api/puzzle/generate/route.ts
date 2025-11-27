import { NextRequest, NextResponse } from 'next/server'
import type { PuzzleDifficulty } from '@/types'
import { generatePracticePuzzle } from '@/lib/puzzle-generator'

const ALLOWED_DIFFICULTIES: PuzzleDifficulty[] = ['easy', 'medium', 'hard']

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const difficultyParam = (searchParams.get('difficulty') || 'medium').toLowerCase() as PuzzleDifficulty
    const difficulty = ALLOWED_DIFFICULTIES.includes(difficultyParam) ? difficultyParam : 'medium'
    
    // Check for shared puzzle params (start/goal words)
    const startWord = searchParams.get('start')?.toLowerCase()
    const goalWord = searchParams.get('goal')?.toLowerCase()

    const puzzle = await generatePracticePuzzle(difficulty, startWord || undefined, goalWord || undefined)

    return NextResponse.json({
      success: true,
      data: {
        ...puzzle,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Error generating practice puzzle:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate practice puzzle',
      },
      { status: 500 }
    )
  }
}
