/**
 * Goal-directed hint generation (client-side)
 *
 * Instead of ranking candidates by frequency alone, we compute the shortest
 * path from each candidate to the goal using BFS.  The hint always suggests
 * a word that brings the player as close as possible to the goal.
 */

import type { GraphNode, PuzzleDifficulty } from '@/types'
import { findSuffixConnections } from './compound-utils'
import { getEnvironment, type WordEnvironment } from './dictionary'

export interface HintResult {
  suggestedWord: string
  sharedPart: string
  parentWord: string
  confidence: 'high' | 'medium' | 'low'
  stepsToGoal?: number
}

const MAX_PATH_DEPTH = 15

/**
 * BFS shortest-path from `startKeys` to `goalWord`.
 *
 * Follows the same compound-word chain rules the game uses:
 *   1. From a set of keys, look up all compound words that *start* with any
 *      of those keys via `environment.incomingIndex`.
 *   2. Each such word exposes `outgoingKeys` (its last part(s)).
 *   3. If any outgoing key equals `goalWord`, we are done.
 *   4. Otherwise enqueue the outgoing keys and repeat.
 *
 * Returns the number of compound-word steps needed, or `null` when the goal
 * is unreachable within `maxDepth` hops.
 */
function findShortestPathToGoal(
  startKeys: string[],
  goalWord: string,
  environment: WordEnvironment,
  usedWords: Set<string>,
  maxDepth: number = MAX_PATH_DEPTH,
): number | null {
  const goalLower = goalWord.toLowerCase()

  // Fast path: does any start key already match the goal?
  if (startKeys.some(k => k.toLowerCase() === goalLower)) return 0

  const queue: Array<{ key: string; depth: number }> = startKeys.map(key => ({ key, depth: 0 }))
  const visited = new Set<string>(startKeys.map(k => k.toLowerCase()))

  for (let i = 0; i < queue.length; i++) {
    const { key, depth } = queue[i]
    if (depth >= maxDepth) continue

    const candidates = environment.incomingIndex.get(key) ?? []
    for (const candidate of candidates) {
      if (usedWords.has(candidate.word)) continue

      for (const nextKey of candidate.outgoingKeys) {
        const nextLower = nextKey.toLowerCase()
        if (nextLower === goalLower) return depth + 1
        if (visited.has(nextLower)) continue
        visited.add(nextLower)
        queue.push({ key: nextKey, depth: depth + 1 })
      }
    }
  }

  return null
}

/**
 * Get the best node to use as a hint source
 */
export function getHintSourceNode(
  nodes: GraphNode[],
  selectedNodeId: string | null
): GraphNode | null {
  if (nodes.length === 0) {
    return null
  }

  const selectedNode = selectedNodeId
    ? nodes.find(n => n.id === selectedNodeId)
    : null

  return selectedNode ||
    nodes
      .filter(n => !n.isGoal && !n.isStart)
      .sort((a, b) => b.layer - a.layer)[0] ||
    nodes.find(n => n.isStart) ||
    null
}

/**
 * Analyze hint result to provide user-friendly message
 */
export function formatHintMessage(hint: HintResult): string {
  if (hint.confidence === 'high') {
    return `Prøv "${hint.suggestedWord}" — det deler "${hint.sharedPart}" med "${hint.parentWord}"`
  }
  if (hint.stepsToGoal != null && hint.stepsToGoal <= 2) {
    return `"${hint.suggestedWord}" bringer deg nærmere målet (${hint.stepsToGoal} steg igjen)`
  }
  if (hint.confidence === 'medium') {
    return `Vurder "${hint.suggestedWord}" — det kobler via "${hint.sharedPart}"`
  }
  return `Du kan prøve "${hint.suggestedWord}"`
}

/**
 * Generate the best hint for the current game state.
 *
 * Scoring priorities:
 *   1. Shortest remaining path to goal  (primary — goal-directed)
 *   2. Word frequency                   (tiebreaker — prefer common words)
 *   3. Transition salience              (secondary tiebreaker)
 *
 * Candidates that cannot reach the goal at all are discarded.
 */
export async function generateHint(options: {
  nodes: GraphNode[]
  goalWord: string
  selectedNodeId: string | null
  difficulty?: PuzzleDifficulty
}): Promise<HintResult | null> {
  const { nodes, goalWord, selectedNodeId, difficulty = 'medium' } = options

  if (nodes.length === 0 || !goalWord) {
    return null
  }

  const sourceNode = getHintSourceNode(nodes, selectedNodeId)
  if (!sourceNode) {
    return null
  }

  const sourceKeys = sourceNode.outgoingKeys ?? (sourceNode.isStart
    ? [sourceNode.word.toLowerCase()]
    : [])

  const goalWordLower = goalWord.toLowerCase()
  const usedWords = new Set(nodes.map(n => n.word.toLowerCase()))

  const environment = await getEnvironment(difficulty)

  // Collect unique candidate words (cap per key to keep BFS cost bounded)
  const words = [...new Map(sourceKeys.flatMap(key =>
    (environment.incomingIndex.get(key) ?? []).slice(0, 200)
  ).map(entry => [entry.analysisId, entry])).values()]

  const candidateWords: Array<{
    word: string
    parts: string[]
    sharedPart: string
    confidence: 'high' | 'medium' | 'low'
    score: number
    stepsToGoal: number
  }> = []

  for (const wordEntry of words) {
    // Skip already-used words
    if (usedWords.has(wordEntry.word.toLowerCase())) continue

    // Verify it can connect to existing graph nodes
    const connectionResult = findSuffixConnections(
      wordEntry.word, wordEntry.parts, nodes, wordEntry.incomingKeys,
    )
    if (!connectionResult.canConnect) continue

    // Must connect specifically from the source node
    const sourceConnection = connectionResult.connections.find(
      conn => conn.node.id === sourceNode.id,
    )
    if (!sourceConnection) continue

    // Compute remaining distance from this candidate to the goal
    const pathToGoal = findShortestPathToGoal(
      wordEntry.outgoingKeys,
      goalWordLower,
      environment,
      usedWords,
    )

    // Discard candidates that cannot reach the goal at all
    if (pathToGoal === null) continue

    // Transition salience for this specific junction
    const incomingIndex = wordEntry.incomingKeys.indexOf(sourceConnection.sharedPart)
    const transitionSalience = incomingIndex >= 0
      ? wordEntry.incomingSalience[incomingIndex]
      : 0

    // Score: path-length dominates, frequency breaks ties
    const score = -pathToGoal * 100_000
      + wordEntry.frequency * 100
      + transitionSalience * 25

    const hasGoalPart = pathToGoal <= 1

    candidateWords.push({
      word: wordEntry.word,
      parts: wordEntry.parts,
      sharedPart: sourceConnection.sharedPart,
      confidence: hasGoalPart ? 'high' : 'medium',
      score,
      stepsToGoal: pathToGoal,
    })
  }

  if (candidateWords.length === 0) {
    return null
  }

  // Sort by score (highest first) — shortest path wins
  candidateWords.sort((a, b) => b.score - a.score)

  const bestHint = candidateWords[0]

  return {
    suggestedWord: bestHint.word,
    sharedPart: bestHint.sharedPart,
    parentWord: sourceNode.word,
    confidence: bestHint.confidence,
    stepsToGoal: bestHint.stepsToGoal,
  }
}
