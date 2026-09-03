'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { GraphNode, GraphEdge, GameState, PuzzleInstance } from '@/types'
import {
  findSuffixConnections,
  generateNodeId,
  generateEdgeId,
} from '@/lib/compound-utils'
import { normalizeNo } from '@/lib/norwegian-dictionary'
import {
  OCCURRENCE_TREE_STATE_VERSION,
  chooseOccurrenceParent,
  isDistinctWordPath,
  traceOccurrencePath,
} from '@/lib/occurrence-tree'
import { quickValidate } from '@/lib/quick-validation'
import { validateCompoundWord } from '@/lib/validation'
import {
  getSavedGameState,
  saveGameState,
  markPuzzleCompleted,
  updatePlayerStats,
  upsertScore,
  recordPathFound,
  isPuzzleCompleted,
} from '@/lib/player-id'

interface SavedState {
  version?: number
  nodes: GraphNode[]
  edges: GraphEdge[]
  wordsUsed: number
  maxLayer: number
  isComplete: boolean
  completedAt?: string
  startTime?: number
  finalTimeElapsed?: number
  allPaths?: string[][]
  winningPath?: string[]
  winningPathNodeIds?: string[]
}

interface AddWordResult {
  success: boolean
  error?: string
  isNewPath?: boolean
  parentId?: string
  parentWord?: string
  reused?: boolean
}

interface UseGameStateResult extends GameState {
  addWord: (word: string) => Promise<AddWordResult>
  selectNode: (nodeId: string | null) => void
  reset: () => void
  winningPath: string[]
  winningPathNodeIds: string[]
  allPaths: string[][]
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
  const [winningPathNodeIds, setWinningPathNodeIds] = useState<string[]>([])
  const [allPaths, setAllPaths] = useState<string[][]>([])
  const allPathsRef = useRef<string[][]>([])
  const [startTime, setStartTime] = useState(() => Date.now())
  const [finalTimeElapsed, setFinalTimeElapsed] = useState<number | null>(null)
  const [wasRestoredComplete, setWasRestoredComplete] = useState(false)
  const scoreSubmittedRef = useRef(false)
  const submissionInFlightRef = useRef(false)
  
  // Keep ref in sync with state
  useEffect(() => {
    allPathsRef.current = allPaths
  }, [allPaths])

  // The goal is a marker rather than a player placement, so it may share the
  // same label as an earlier occurrence in puzzles that intentionally loop.
  const hasUniqueWords = useCallback((path: string[]): boolean => {
    const words = path.slice(0, -1).map((word) => normalizeNo(word))
    const uniqueWords = new Set(words)
    return words.length === uniqueWords.size
  }, [])

  // Initialize game with start and goal nodes
  useEffect(() => {
    if (!puzzle) return

    const persistenceKey = puzzle.isDaily ? puzzle.date : undefined

    // Check for saved state (daily puzzles only)
    const savedState = persistenceKey
      ? (getSavedGameState(persistenceKey) as SavedState | null)
      : null

    setError(null)
    setAllowExploration(false)
    setWasRestoredComplete(false)
    setWinningPath([])
    setWinningPathNodeIds([])
    setAllPaths([])
    allPathsRef.current = []
    setFinalTimeElapsed(null)
    setSelectedNodeId('start')
    
    if (
      savedState?.version === OCCURRENCE_TREE_STATE_VERSION &&
      savedState.nodes &&
      savedState.nodes.length > 0
    ) {
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
        
        setWinningPath(savedState.winningPath ?? savedState.allPaths?.[0] ?? [])
        setWinningPathNodeIds(savedState.winningPathNodeIds ?? [])
        
        // Restore all paths if saved, filtering out any with duplicate words
        if (savedState.allPaths && savedState.allPaths.length > 0) {
          const validPaths = savedState.allPaths.filter(p => hasUniqueWords(p))
          if (validPaths.length > 0) {
            setAllPaths(validPaths)
            allPathsRef.current = validPaths // Update ref immediately
          }
        }
      }
      return
    }

    // Initialize with start and goal nodes
    // Start and goal are ALWAYS simple words (single part = the word itself)
    const startParts = [puzzle.startWord]
    const goalParts = [puzzle.goalWord]

    const startNode: GraphNode = {
      id: 'start',
      word: puzzle.startWord,
      parts: startParts,
      incomingKeys: [normalizeNo(puzzle.startWord)],
      outgoingKeys: [normalizeNo(puzzle.startWord)],
      layer: 0,
      isStart: true,
      isGoal: false,
      isCompleted: false,
    }

    const goalNode: GraphNode = {
      id: 'goal',
      word: puzzle.goalWord,
      parts: goalParts,
      incomingKeys: [normalizeNo(puzzle.goalWord)],
      outgoingKeys: [normalizeNo(puzzle.goalWord)],
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
    setWinningPathNodeIds([])
    setAllPaths([])
    allPathsRef.current = [] // Update ref immediately
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
      version: OCCURRENCE_TREE_STATE_VERSION,
      nodes,
      edges,
      wordsUsed,
      maxLayer,
      isComplete,
      startTime,
      finalTimeElapsed: finalTimeElapsed ?? undefined,
      allPaths: allPaths.length > 0 ? allPaths : undefined,
      winningPath: winningPath.length > 0 ? winningPath : undefined,
      winningPathNodeIds: winningPathNodeIds.length > 0 ? winningPathNodeIds : undefined,
    }

    if (puzzle.isDaily) {
      saveGameState(puzzle.date, state)
    }
  }, [puzzle, nodes, edges, wordsUsed, maxLayer, isComplete, startTime, finalTimeElapsed, allPaths, winningPath, winningPathNodeIds])

  const addWord = useCallback(async (word: string): Promise<AddWordResult> => {
    if (!puzzle) {
      return { success: false, error: 'Puslespillet er ikke lastet inn' }
    }

    if (isComplete && !allowExploration) {
      return { success: false, error: 'Puslespillet er allerede fullført' }
    }

    if (submissionInFlightRef.current) {
      return { success: false, error: 'Ordet sjekkes allerede' }
    }

    submissionInFlightRef.current = true
    setIsLoading(true)
    setError(null)

    try {
      const normalized = normalizeNo(word)

      // Quick client-side validation
      const quickCheck = quickValidate(normalized)
      if (!quickCheck.valid) {
        setError(quickCheck.error || 'Ugyldig ord')
        return { success: false, error: quickCheck.error }
      }

      // Validate against the full reviewed dictionary, independent of puzzle tier.
      const validation = await validateCompoundWord(normalized)

      if (!validation.valid) {
        setError(validation.error || 'Ikke et gyldig sammensatt ord')
        return { success: false, error: validation.error }
      }

      const analyses = validation.analyses?.length
        ? validation.analyses
        : [{
            parts: validation.parts,
            incomingKeys: validation.incomingKeys ?? [],
            outgoingKeys: validation.outgoingKeys ?? [],
          }]
      const analysisConnections = analyses.map(analysis => ({
        analysis,
        result: findSuffixConnections(normalized, analysis.parts, nodes, analysis.incomingKeys),
      }))
      const connections = analysisConnections.flatMap(option => option.result.connections)
      const parentConnection = chooseOccurrenceParent(
        connections,
        selectedNodeId,
        nodes,
        edges,
        normalized
      )

      if (!parentConnection) {
        const err = connections.length > 0
          ? 'Ordet er allerede brukt fra alle passende grener'
          : 'Ordet må begynne med en sluttdel fra et eksisterende ord'
        setError(err)
        return { success: false, error: err }
      }

      const selectedAnalysis = analysisConnections.find(option => option.result.connections.some(connection =>
        connection.node.id === parentConnection.node.id && connection.sharedPart === parentConnection.sharedPart
      ))?.analysis ?? analyses[0]

      const parent = parentConnection.node
      const newLayer = parent.layer + 1
      const reused = nodes.some(
        (node) => !node.isGoal && normalizeNo(node.word) === normalized
      )
      const newNode: GraphNode = {
        id: generateNodeId(),
        word: normalized,
        parts: selectedAnalysis.parts,
        incomingKeys: selectedAnalysis.incomingKeys,
        outgoingKeys: selectedAnalysis.outgoingKeys,
        layer: newLayer,
        isStart: false,
        isGoal: false,
        isCompleted: false,
        parentId: parent.id,
        isReused: reused,
      }

      const newEdges: GraphEdge[] = [{
        id: generateEdgeId(parent.id, newNode.id),
        source: parent.id,
        target: newNode.id,
        sharedPart: parentConnection.sharedPart,
      }]

      const goalWord = normalizeNo(puzzle.goalWord)
      const reachesGoal = selectedAnalysis.outgoingKeys.includes(goalWord)
      let nextNodes = [...nodes, newNode]
      let completedPath: ReturnType<typeof traceOccurrencePath> = null

      if (reachesGoal) {
        const targetGoal = nodes.find((node) => node.isGoal && !node.parentId)
        const goalNode: GraphNode = targetGoal
          ? {
              ...targetGoal,
              layer: newLayer + 1,
              parentId: newNode.id,
              isCompleted: true,
            }
          : {
              id: `goal-${generateNodeId()}`,
              word: puzzle.goalWord,
              parts: [goalWord],
              incomingKeys: [goalWord],
              outgoingKeys: [goalWord],
              layer: newLayer + 1,
              isStart: false,
              isGoal: true,
              isCompleted: true,
              parentId: newNode.id,
            }

        nextNodes = targetGoal
          ? nextNodes.map((node) => node.id === targetGoal.id ? goalNode : node)
          : [...nextNodes, goalNode]
        newEdges.push({
          id: generateEdgeId(newNode.id, goalNode.id),
          source: newNode.id,
          target: goalNode.id,
          sharedPart: goalWord,
        })
        completedPath = traceOccurrencePath(goalNode.id, nextNodes)
      }

      setNodes(nextNodes)
      setEdges([...edges, ...newEdges])
      setWordsUsed(prev => prev + 1)
      setMaxLayer(prev => Math.max(prev, newLayer))
      setSelectedNodeId(newNode.id)

      if (completedPath && hasUniqueWords(completedPath.words)) {
        const isFirstWin = !isComplete
        const currentPaths = allPathsRef.current
        const isNewPath = isDistinctWordPath(completedPath.words, currentPaths)

        if (!isNewPath) {
          return { success: true, isNewPath: false, parentId: parent.id, parentWord: parent.word, reused }
        }

        const nextPaths = [...currentPaths, completedPath.words].sort((a, b) => a.length - b.length)
        setAllPaths(nextPaths)
        allPathsRef.current = nextPaths

        if (winningPath.length === 0 || completedPath.words.length < winningPath.length) {
          setWinningPath(completedPath.words)
          setWinningPathNodeIds(completedPath.nodeIds)
        }

        if (isFirstWin) {
          const elapsed = Date.now() - startTime
          setFinalTimeElapsed(elapsed)
          setIsComplete(true)
          setAllowExploration(true)

          if (puzzle.isDaily) {
            const previouslyCompleted = isPuzzleCompleted(puzzle.date)
            markPuzzleCompleted(puzzle.date)
            if (!previouslyCompleted) {
              updatePlayerStats(wordsUsed + 1, true, { isDaily: true })
            }
          }
        } else if (puzzle.isDaily) {
          recordPathFound(puzzle.date)
        }

        return { success: true, isNewPath: true, parentId: parent.id, parentWord: parent.word, reused }
      }

      return { success: true, parentId: parent.id, parentWord: parent.word, reused }
    } catch (err) {
      console.error('Error adding word:', err)
      const errorMsg = err instanceof Error ? err.message : 'Kunne ikke legge til ordet'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    } finally {
      submissionInFlightRef.current = false
      setIsLoading(false)
    }
  }, [puzzle, nodes, edges, selectedNodeId, isComplete, allowExploration, winningPath, wordsUsed, startTime, hasUniqueWords])

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId)
    setError(null)
  }, [])

  const reset = useCallback(() => {
    if (!puzzle) return

    const startParts = [puzzle.startWord]
    const goalParts = [puzzle.goalWord]

    const startNode: GraphNode = {
      id: 'start',
      word: puzzle.startWord,
      parts: startParts,
      incomingKeys: [normalizeNo(puzzle.startWord)],
      outgoingKeys: [normalizeNo(puzzle.startWord)],
      layer: 0,
      isStart: true,
      isGoal: false,
      isCompleted: false,
    }

    const goalNode: GraphNode = {
      id: 'goal',
      word: puzzle.goalWord,
      parts: goalParts,
      incomingKeys: [normalizeNo(puzzle.goalWord)],
      outgoingKeys: [normalizeNo(puzzle.goalWord)],
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
    setWinningPathNodeIds([])
    setAllPaths([])
    allPathsRef.current = []
    setSelectedNodeId('start')
    setError(null)
    setWasRestoredComplete(false)
    setStartTime(Date.now())
    setFinalTimeElapsed(null)
    scoreSubmittedRef.current = false
    submissionInFlightRef.current = false

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
      // Calculate layers from winning path (only layers used to reach goal)
      let layersToSubmit = maxLayer
      if (winningPathNodeIds.length > 0) {
        const winningIds = new Set(winningPathNodeIds)
        const winningPathNodes = nodes.filter((node) => winningIds.has(node.id))
        if (winningPathNodes.length > 0) {
          // Get max layer from winning path nodes (exclude goal node which has layer -1)
          const pathLayers = winningPathNodes
            .filter(n => !n.isGoal && n.layer >= 0)
            .map(n => n.layer)
          if (pathLayers.length > 0) {
            // Add 1 because layers are 0-indexed (layer 0, 1, 2 = 3 layers total)
            layersToSubmit = Math.max(...pathLayers) + 1
          }
        }
      }

      // Save the score locally (per-device history)
      const finishedAtMs = startTime + (finalTimeElapsed ?? Date.now() - startTime)
      upsertScore({
        puzzleDate: puzzle.date,
        wordsUsed,
        layers: layersToSubmit,
        pathsFound: Math.max(1, allPaths.length),
        finishedAt: new Date(finishedAtMs).toISOString(),
        elapsedMs: finalTimeElapsed ?? null,
      })

      scoreSubmittedRef.current = true
    } catch (error) {
      console.error('Error saving score:', error)
    }
  }, [puzzle, isComplete, wordsUsed, maxLayer, finalTimeElapsed, winningPathNodeIds, nodes, startTime, allPaths.length])

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
    winningPathNodeIds,
    allPaths,
    startTime,
    finalTimeElapsed,
    submitScore,
    allowExploration,
    enableExploration,
    wasRestoredComplete,
  }
}
