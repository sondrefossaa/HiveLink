'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DailyPuzzle } from '@/types'

interface UsePuzzleResult {
  puzzle: DailyPuzzle | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function usePuzzle(): UsePuzzleResult {
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPuzzle = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/puzzle/today')
      const data = await response.json()

      if (data.success && data.data) {
        setPuzzle(data.data)
      } else {
        throw new Error(data.error || 'Failed to fetch puzzle')
      }
    } catch (err) {
      console.error('Error fetching puzzle:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch puzzle')
      
      // Set a fallback puzzle
      setPuzzle({
        id: 0,
        puzzleNumber: 1,
        date: new Date().toISOString().split('T')[0],
        startWord: 'butterfly',
        goalWord: 'moonshine',
        optimalSteps: 6,
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPuzzle()
  }, [fetchPuzzle])

  // Check for midnight reset
  useEffect(() => {
    const checkForReset = () => {
      const now = new Date()
      const currentDate = now.toISOString().split('T')[0]
      
      if (puzzle && puzzle.date !== currentDate) {
        fetchPuzzle()
      }
    }

    // Check every minute
    const interval = setInterval(checkForReset, 60000)
    return () => clearInterval(interval)
  }, [puzzle, fetchPuzzle])

  return {
    puzzle,
    isLoading,
    error,
    refetch: fetchPuzzle,
  }
}

