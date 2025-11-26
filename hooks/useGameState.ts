'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { GraphNode, GraphEdge, GameState, ValidationResult, DailyPuzzle } from '@/types'
import {
  parseCompoundWord,
  canConnect,
  isGoalWord,
  generateNodeId,
  generateEdgeId,
  findPathToNode,
} from '@/lib/compound-utils'
import { quickValidate } from '@/lib/validation'
import {
  getSavedGameState,
  saveGameState,
  markPuzzleCompleted,
  isPuzzleCompleted,
  updatePlayerStats,
  getPlayerId,
} from '@/lib/player-id'

interface SavedState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  wordsUsed: number
  maxLayer: number
  isComplete: boolean
  completedAt?: string
}

interface UseGameStateResult extends GameState {
  addWord: (word: string) => Promise<{ success: boolean; error?: string }>
  selectNode: (nodeId: string | null) => void
  reset: () => void
  winningPath: string[]
  startTime: number
  submitScore: () => Promise<void>
}

export function useGameState(puzzle: DailyPuzzle | null): UseGameStateResult {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [wordsUsed, setWordsUsed] = useState(0)
  const [maxLayer, setMaxLayer] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [winningPath, setWinningPath] = useState<string[]>([])
  const [startTime] = useState(() => Date.now())
  const scoreSubmittedRef = useRef(false)

  // Initialize game with start and goal nodes
  useEffect(() => {
    if (!puzzle) return

    const puzzleDate = puzzle.date

    // Check for saved state
    const savedState = getSavedGameState(puzzleDate) as SavedState | null
    
    if (savedState && savedState.nodes && savedState.nodes.length > 0) {
      setNodes(savedState.nodes)
      setEdges(savedState.edges || [])
      setWordsUsed(savedState.wordsUsed || 0)
      setMaxLayer(savedState.maxLayer || 0)
      setIsComplete(savedState.isComplete || false)
      
      if (savedState.isComplete) {
        const goalNode = savedState.nodes.find(n => n.isGoal && n.isCompleted)
        if (goalNode) {
          const path = findPathToNode(goalNode.id, savedState.nodes, savedState.edges || [])
          setWinningPath(path)
        }
      }
      return
    }

    // Initialize with start and goal nodes
    const startParts = parseCompoundWord(puzzle.startWord)
    const goalParts = parseCompoundWord(puzzle.goalWord)

    const startNode: GraphNode = {
      id: 'start',
      word: puzzle.startWord,
      parts: startParts,
      layer: 0,
      isStart: true,
      isGoal: false,
      isCompleted: false,
      fx: 100, // Fixed x position on left
    }

    const goalNode: GraphNode = {
      id: 'goal',
      word: puzzle.goalWord,
      parts: goalParts,
      layer: -1, // Special layer for goal
      isStart: false,
      isGoal: true,
      isCompleted: false,
      fx: 900, // Fixed x position on right (will be adjusted based on container)
    }

    setNodes([startNode, goalNode])
    setEdges([])
    setWordsUsed(0)
    setMaxLayer(0)
    setIsComplete(false)
    setWinningPath([])
    setSelectedNodeId('start')
    scoreSubmittedRef.current = false
  }, [puzzle])

  // Save state when it changes
  useEffect(() => {
    if (!puzzle || nodes.length === 0) return

    const state: SavedState = {
      nodes,
      edges,
      wordsUsed,
      maxLayer,
      isComplete,
    }

    saveGameState(puzzle.date, state)
  }, [puzzle, nodes, edges, wordsUsed, maxLayer, isComplete])

  const addWord = useCallback(async (word: string): Promise<{ success: boolean; error?: string }> => {
    if (!puzzle) {
      return { success: false, error: 'Puzzle not loaded' }
    }

    if (isComplete) {
      return { success: false, error: 'Puzzle already completed' }
    }

    setIsLoading(true)
    setError(null)

    try {
      const normalized = word.toLowerCase().replace(/[^a-z]/g, '')

      // Quick client-side validation
      const quickCheck = quickValidate(normalized)
      if (!quickCheck.valid) {
        setError(quickCheck.error || 'Invalid word')
        return { success: false, error: quickCheck.error }
      }

      // Check if word is already used
      if (nodes.some(n => n.word.toLowerCase() === normalized)) {
        const err = 'Word already used'
        setError(err)
        return { success: false, error: err }
      }

      // Validate via API
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: normalized }),
      })

      const result = await response.json()
      
      if (!result.success || !result.data) {
        const err = result.error || 'Validation failed'
        setError(err)
        return { success: false, error: err }
      }

      const validation: ValidationResult = result.data

      if (!validation.valid) {
        setError(validation.error || 'Not a valid compound word')
        return { success: false, error: validation.error }
      }

      // Check if this word can connect to existing nodes
      const connectionResult = canConnect(normalized, validation.parts, nodes)

      if (!connectionResult.canConnect || !connectionResult.parentNode) {
        const err = 'Word must share exactly one part with an existing word'
        setError(err)
        return { success: false, error: err }
      }

      // Check if this is the goal word
      const isWinningWord = isGoalWord(normalized, puzzle.goalWord)

      // Create new node
      const newLayer = connectionResult.parentNode.layer + 1
      const newNode: GraphNode = {
        id: generateNodeId(),
        word: normalized,
        parts: validation.parts,
        layer: newLayer,
        isStart: false,
        isGoal: isWinningWord,
        isCompleted: isWinningWord,
      }

      // Create edge
      const newEdge: GraphEdge = {
        id: generateEdgeId(connectionResult.parentNode.id, newNode.id),
        source: connectionResult.parentNode.id,
        target: newNode.id,
        sharedPart: connectionResult.sharedPart || '',
      }

      // Update state
      setNodes(prev => {
        const updated = [...prev]
        // If winning, mark the goal node as completed
        if (isWinningWord) {
          const goalIndex = updated.findIndex(n => n.isGoal)
          if (goalIndex >= 0) {
            updated[goalIndex] = { ...updated[goalIndex], isCompleted: true }
          }
        }
        return [...updated, newNode]
      })

      setEdges(prev => [...prev, newEdge])
      setWordsUsed(prev => prev + 1)
      setMaxLayer(prev => Math.max(prev, newLayer))
      setSelectedNodeId(newNode.id)

      if (isWinningWord) {
        setIsComplete(true)
        markPuzzleCompleted(puzzle.date)
        updatePlayerStats(wordsUsed + 1, true)

        // Calculate winning path
        const path = findPathToNode(newNode.id, [...nodes, newNode], [...edges, newEdge])
        setWinningPath(path)
      }

      return { success: true }
    } catch (err) {
      console.error('Error adding word:', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to add word'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    } finally {
      setIsLoading(false)
    }
  }, [puzzle, nodes, edges, isComplete, wordsUsed])

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId)
    setError(null)
  }, [])

  const reset = useCallback(() => {
    if (!puzzle) return

    const startParts = parseCompoundWord(puzzle.startWord)
    const goalParts = parseCompoundWord(puzzle.goalWord)

    const startNode: GraphNode = {
      id: 'start',
      word: puzzle.startWord,
      parts: startParts,
      layer: 0,
      isStart: true,
      isGoal: false,
      isCompleted: false,
      fx: 100,
    }

    const goalNode: GraphNode = {
      id: 'goal',
      word: puzzle.goalWord,
      parts: goalParts,
      layer: -1,
      isStart: false,
      isGoal: true,
      isCompleted: false,
      fx: 900,
    }

    setNodes([startNode, goalNode])
    setEdges([])
    setWordsUsed(0)
    setMaxLayer(0)
    setIsComplete(false)
    setWinningPath([])
    setSelectedNodeId('start')
    setError(null)
    scoreSubmittedRef.current = false

    // Clear saved state
    saveGameState(puzzle.date, null)
  }, [puzzle])

  const submitScore = useCallback(async () => {
    if (!puzzle || !isComplete || scoreSubmittedRef.current) return

    try {
      const playerId = getPlayerId()
      
      await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          wordsUsed,
          layers: maxLayer,
          puzzleDate: puzzle.date,
        }),
      })

      scoreSubmittedRef.current = true
    } catch (error) {
      console.error('Error submitting score:', error)
    }
  }, [puzzle, isComplete, wordsUsed, maxLayer])

  // Auto-submit score when game is complete
  useEffect(() => {
    if (isComplete && !scoreSubmittedRef.current) {
      submitScore()
    }
  }, [isComplete, submitScore])

  return {
    nodes,
    edges,
    wordsUsed,
    maxLayer,
    isComplete,
    isLoading,
    selectedNodeId,
    error,
    addWord,
    selectNode,
    reset,
    winningPath,
    startTime,
    submitScore,
  }
}

