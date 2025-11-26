import { NextRequest, NextResponse } from 'next/server'
import { validateCompoundWord } from '@/lib/validation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { word } = body

    if (!word || typeof word !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Word is required',
        },
        { status: 400 }
      )
    }

    const normalized = word.toLowerCase().replace(/[^a-z]/g, '')

    if (normalized.length < 4) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          parts: [],
          error: 'Word must be at least 4 characters long',
          word: normalized,
        },
      })
    }

    if (normalized.length > 30) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          parts: [],
          error: 'Word is too long',
          word: normalized,
        },
      })
    }

    const result = await validateCompoundWord(normalized)

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Validation error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed. Please try again.',
      },
      { status: 500 }
    )
  }
}

