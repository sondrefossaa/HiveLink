/**
 * Hint generation logic (client-side utilities)
 * Server-side hint generation is handled in the API route
 */

import type { GraphNode, PuzzleDifficulty } from '@/types'
import { findSuffixConnections } from './compound-utils'
import { getEnvironment } from './dictionary'

export interface HintResult {
  suggestedWord: string
  sharedPart: string
  parentWord: string
  confidence: 'high' | 'medium' | 'low'
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
  } else if (hint.confidence === 'medium') {
    return `Vurder "${hint.suggestedWord}" — det kobler via "${hint.sharedPart}"`
  } else {
    return `Du kan prøve "${hint.suggestedWord}"`
  }
}

/**
 * Generate the best hint for the current game state.
 * Fully client-side: loads the compact static dictionary on demand.
 * Returns null when no valid hint exists.
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

  // Find compound words that can extend from source node's last part.
  // Rule: new word's FIRST part must match source node's LAST part.
  const candidateWords: Array<{
    word: string
    parts: string[]
    sharedPart: string
    hasGoalPart: boolean
    confidence: 'high' | 'medium' | 'low'
    score: number
  }> = []

  const environment = await getEnvironment(difficulty)
  const words = [...new Map(sourceKeys.flatMap(key => (environment.incomingIndex.get(key) ?? []).slice(0, 200))
    .map(entry => [entry.analysisId, entry])).values()]

  for (const wordEntry of words) {
    const wordParts = wordEntry.parts

    // Skip if word is already used
    if (nodes.some(n => n.word.toLowerCase() === wordEntry.word.toLowerCase())) {
      continue
    }

    // Check if this word can connect via suffix chaining
    const connectionResult = findSuffixConnections(wordEntry.word, wordParts, nodes, wordEntry.incomingKeys)

    if (!connectionResult.canConnect) {
      continue
    }

    // Verify it connects from the source node
    const sourceConnection = connectionResult.connections.find(
      conn => conn.node.id === sourceNode.id
    )
    if (!sourceConnection) continue

    // Check if word's last part matches goal word
    const hasGoalPart = wordEntry.outgoingKeys.includes(goalWordLower)

    // Calculate score (higher is better)
    let score = 0
    if (hasGoalPart) score += 1000 // Highest priority - word leads to goal
    score += sourceNode.layer * 10 // Prefer words from higher layers

    candidateWords.push({
      word: wordEntry.word,
      parts: wordParts,
      sharedPart: sourceConnection.sharedPart,
      hasGoalPart,
      confidence: hasGoalPart ? 'high' : 'medium',
      score,
    })
  }

  if (candidateWords.length === 0) {
    return null
  }

  // Sort by score (highest first) - prioritizes words that lead to goal
  candidateWords.sort((a, b) => b.score - a.score)

  const bestHint = candidateWords[0]

  return {
    suggestedWord: bestHint.word,
    sharedPart: bestHint.sharedPart,
    parentWord: sourceNode.word,
    confidence: bestHint.confidence,
  }
}

