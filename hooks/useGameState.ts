'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { GraphNode, GraphEdge, GameState, ValidationResult, PuzzleInstance } from '@/types'
import {
  parseCompoundWord,
  findAllConnections,
  isGoalWord,
  generateNodeId,
  generateEdgeId,
  findPathToNode,
} from '@/lib/compound-utils'
import { quickValidate } from '@/lib/quick-validation'
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
  startTime?: number
  finalTimeElapsed?: number
}

interface UseGameStateResult extends GameState {
  addWord: (word: string) => Promise<{ success: boolean; error?: string }>
  selectNode: (nodeId: string | null) => void
  reset: () => void
  winningPath: string[]
  startTime: number
  finalTimeElapsed: number | null
  submitScore: () => Promise<void>
  allowExploration: boolean
  enableExploration: () => void
  wasRestoredComplete: boolean
}

export function useGameState(puzzle: PuzzleInstance | null): UseGameStateResult {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [wordsUsed, setWordsUsed] = useState(0)
  const [maxLayer, setMaxLayer] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [allowExploration, setAllowExploration] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [winningPath, setWinningPath] = useState<string[]>([])
  const [startTime, setStartTime] = useState(() => Date.now())
  const [finalTimeElapsed, setFinalTimeElapsed] = useState<number | null>(null)
  const [wasRestoredComplete, setWasRestoredComplete] = useState(false)
  const scoreSubmittedRef = useRef(false)

  // Initialize game with start and goal nodes
  useEffect(() => {
    if (!puzzle) return

    const persistenceKey = puzzle.isDaily ? puzzle.date : undefined

    // Check for saved state (daily puzzles only)
    const savedState = persistenceKey
      ? (getSavedGameState(persistenceKey) as SavedState | null)
      : null
    
    if (savedState && savedState.nodes && savedState.nodes.length > 0) {
      setNodes(savedState.nodes)
      setEdges(savedState.edges || [])
      setWordsUsed(savedState.wordsUsed || 0)
      setMaxLayer(savedState.maxLayer || 0)
      setIsComplete(savedState.isComplete || false)
      
      // Restore timing data
      if (savedState.startTime) {
        setStartTime(savedState.startTime)
      }
      if (savedState.finalTimeElapsed) {
        setFinalTimeElapsed(savedState.finalTimeElapsed)
      }
      
      // Mark as restored complete so we don't auto-show victory modal
      if (savedState.isComplete) {
        setWasRestoredComplete(true)
        setAllowExploration(true) // Allow exploration on restored complete games
        
        // Find the winning word node (the one that connected to the goal)
        // It's the node with isGoal=true that isn't the original goal node, 
        // OR find the node that has an edge to the goal
        const goalNode = savedState.nodes.find(n => n.id === 'goal')
        const edges = savedState.edges || []
        
        // Find the node that connects to the goal (has an edge with goal as source or target)
        let winningNodeId: string | undefined
        for (const edge of edges) {
          const sourceId = typeof edge.source === 'string' ? edge.source : edge.source
          const targetId = typeof edge.target === 'string' ? edge.target : edge.target
          if (sourceId === 'goal' || targetId === 'goal') {
            winningNodeId = sourceId === 'goal' ? targetId : sourceId
            break
          }
        }
        
        // If no edge to goal found, find the highest layer completed node
        if (!winningNodeId) {
          const completedNodes = savedState.nodes
            .filter(n => n.isCompleted && n.id !== 'goal' && n.id !== 'start')
            .sort((a, b) => b.layer - a.layer)
          if (completedNodes.length > 0) {
            winningNodeId = completedNodes[0].id
          }
        }
        
        if (winningNodeId) {
          const path = findPathToNode(winningNodeId, savedState.nodes, edges)
          // Add the goal word at the end if not already there
          if (goalNode && path.length > 0 && path[path.length - 1] !== goalNode.word) {
            path.push(goalNode.word)
          }
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
    }

    const goalNode: GraphNode = {
      id: 'goal',
      word: puzzle.goalWord,
      parts: goalParts,
      layer: -1, // Special layer for goal
      isStart: false,
      isGoal: true,
      isCompleted: false,
    }

    setNodes([startNode, goalNode])
    setEdges([])
    setWordsUsed(0)
    setMaxLayer(0)
    setIsComplete(false)
    setAllowExploration(false)
    setWinningPath([])
    setSelectedNodeId('start')
    setWasRestoredComplete(false)
    setStartTime(Date.now())
    setFinalTimeElapsed(null)
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
      startTime,
      finalTimeElapsed: finalTimeElapsed ?? undefined,
    }

    if (puzzle.isDaily) {
      saveGameState(puzzle.date, state)
    }
  }, [puzzle, nodes, edges, wordsUsed, maxLayer, isComplete, startTime, finalTimeElapsed])

  const addWord = useCallback(async (word: string): Promise<{ success: boolean; error?: string }> => {
    if (!puzzle) {
      return { success: false, error: 'Puzzle not loaded' }
    }

    if (isComplete && !allowExploration) {
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

      // Find ALL nodes this word can connect to automatically
      const connectionResult = findAllConnections(normalized, validation.parts, nodes)

      if (!connectionResult.canConnect || connectionResult.connections.length === 0) {
        const err = 'Word must share a part with an existing word'
        setError(err)
        return { success: false, error: err }
      }

      // Separate connections to goal vs non-goal nodes
      const nonGoalConnections = connectionResult.connections.filter(c => !c.node.isGoal)
      const goalConnections = connectionResult.connections.filter(c => c.node.isGoal)
      
      // Check if this is the goal word itself
      const isTheGoalWord = isGoalWord(normalized, puzzle.goalWord)
      
      // To win by connecting to goal, the word must ALSO connect to at least one non-goal node
      // This ensures there's a path from start -> ... -> this word -> goal
      const connectsToGoal = goalConnections.length > 0 && nonGoalConnections.length > 0
      
      // Must have at least one non-goal connection (unless it's the goal word itself)
      if (!isTheGoalWord && nonGoalConnections.length === 0) {
        const err = 'Words must create a series of connections from start toward the goal'
        setError(err)
        return { success: false, error: err }
      }
      
      const isWinningWord = isTheGoalWord || connectsToGoal

      // Determine direction based on which part of the primary parent is shared
      // Use the highest-layer non-goal connection as primary parent
      const primaryConnection = nonGoalConnections.length > 0
        ? nonGoalConnections.reduce((a, b) => a.node.layer > b.node.layer ? a : b)
        : connectionResult.connections[0]
      
      // Check if shared part is the LAST part of the parent (extends forward toward goal)
      const parentParts = primaryConnection.node.parts
      const sharedPart = primaryConnection.sharedPart.toLowerCase()
      const expandsForward = parentParts.length > 0 && 
        parentParts[parentParts.length - 1].toLowerCase() === sharedPart

      // Create new node - layer is one more than the minimum connected layer
      const newLayer = connectionResult.minLayer + 1
      const newNode: GraphNode = {
        id: generateNodeId(),
        word: normalized,
        parts: validation.parts,
        layer: newLayer,
        isStart: false,
        isGoal: isWinningWord,
        isCompleted: isWinningWord,
        expandsForward,
      }

      // Create edges to ALL connected nodes
      const newEdges: GraphEdge[] = connectionResult.connections.map(conn => ({
        id: generateEdgeId(conn.node.id, newNode.id),
        source: conn.node.id,
        target: newNode.id,
        sharedPart: conn.sharedPart,
      }))

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

      setEdges(prev => [...prev, ...newEdges])
      setWordsUsed(prev => prev + 1)
      setMaxLayer(prev => Math.max(prev, newLayer))
      setSelectedNodeId(newNode.id)

      if (isWinningWord) {
        // Lock in the final time before setting complete
        const elapsed = Date.now() - startTime
        setFinalTimeElapsed(elapsed)
        
        setIsComplete(true)
        setAllowExploration(false)
        if (puzzle.isDaily) {
          markPuzzleCompleted(puzzle.date)
          updatePlayerStats(wordsUsed + 1, true, { isDaily: true })
        }

        // Calculate winning path from start to the winning word
        const path = findPathToNode(newNode.id, [...nodes, newNode], [...edges, ...newEdges])
        // Add the goal word at the end if the winning word isn't the goal itself
        const goalNode = nodes.find(n => n.id === 'goal')
        if (goalNode && path.length > 0 && path[path.length - 1].toLowerCase() !== goalNode.word.toLowerCase()) {
          path.push(goalNode.word)
        }
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
    }

    const goalNode: GraphNode = {
      id: 'goal',
      word: puzzle.goalWord,
      parts: goalParts,
      layer: -1,
      isStart: false,
      isGoal: true,
      isCompleted: false,
    }

    setNodes([startNode, goalNode])
    setEdges([])
    setWordsUsed(0)
    setMaxLayer(0)
    setIsComplete(false)
    setAllowExploration(false)
    setWinningPath([])
    setSelectedNodeId('start')
    setError(null)
    scoreSubmittedRef.current = false

    // Clear saved state
    if (puzzle.isDaily) {
      saveGameState(puzzle.date, null)
    }
  }, [puzzle])

  const enableExploration = useCallback(() => {
    if (!isComplete) return
    setAllowExploration(true)
    setError(null)
  }, [isComplete])

  const submitScore = useCallback(async () => {
    if (!puzzle || !puzzle.isDaily || !isComplete || scoreSubmittedRef.current) return

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
          isDaily: puzzle.isDaily,
        }),
      })

      scoreSubmittedRef.current = true
    } catch (error) {
      console.error('Error submitting score:', error)
    }
  }, [puzzle, isComplete, wordsUsed, maxLayer])

  // Auto-submit score when game is complete
  useEffect(() => {
    if (isComplete && puzzle?.isDaily && !scoreSubmittedRef.current) {
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
    finalTimeElapsed,
    submitScore,
    allowExploration,
    enableExploration,
    wasRestoredComplete,
  }
}

