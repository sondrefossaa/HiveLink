/**
 * Hint generation logic (client-side utilities)
 * Server-side hint generation is handled in the API route
 */

import type { GraphNode } from '@/types'
import { findSuffixConnections } from './compound-utils'
import { getWordsStartingWith } from './dictionary'

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
    return `Try "${hint.suggestedWord}" - it shares "${hint.sharedPart}" with "${hint.parentWord}"`
  } else if (hint.confidence === 'medium') {
    return `Consider "${hint.suggestedWord}" - it connects via "${hint.sharedPart}"`
  } else {
    return `You could try "${hint.suggestedWord}"`
  }
}

/**
 * Generate the best hint for the current game state.
 * Fully client-side: uses the bundled dictionary (no server, no ads).
 * Returns null when no valid hint exists.
 */
export function generateHint(options: {
  nodes: GraphNode[]
  goalWord: string
  selectedNodeId: string | null
}): HintResult | null {
  const { nodes, goalWord, selectedNodeId } = options

  if (nodes.length === 0 || !goalWord) {
    return null
  }

  const sourceNode = getHintSourceNode(nodes, selectedNodeId)
  if (!sourceNode) {
    return null
  }

  // Get the last part from the source node (for suffix chaining)
  const sourceParts = sourceNode.parts
  const sourceLastPart = sourceParts.length > 0
    ? sourceParts[sourceParts.length - 1].toLowerCase()
    : sourceNode.word.toLowerCase()

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

  const words = getWordsStartingWith(sourceLastPart, 200)

  for (const wordEntry of words) {
    const wordParts = wordEntry.parts

    // Skip if word is already used
    if (nodes.some(n => n.word.toLowerCase() === wordEntry.word.toLowerCase())) {
      continue
    }

    // Check if this word can connect via suffix chaining
    const connectionResult = findSuffixConnections(wordEntry.word, wordParts, nodes)

    if (!connectionResult.canConnect) {
      continue
    }

    // Verify it connects from the source node
    const sourceConnection = connectionResult.connections.find(
      conn => conn.node.id === sourceNode.id
    )
    if (!sourceConnection) continue

    // Check if word's last part matches goal word
    const wordLastPart = wordParts.length > 0
      ? wordParts[wordParts.length - 1].toLowerCase()
      : wordEntry.word.toLowerCase()
    const hasGoalPart = wordLastPart === goalWordLower

    // Calculate score (higher is better)
    let score = 0
    if (hasGoalPart) score += 1000 // Highest priority - word leads to goal
    score += sourceNode.layer * 10 // Prefer words from higher layers

    candidateWords.push({
      word: wordEntry.word,
      parts: wordParts,
      sharedPart: sourceLastPart,
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

