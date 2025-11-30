/**
 * Hint generation logic (client-side utilities)
 * Server-side hint generation is handled in the API route
 */

import type { GraphNode } from '@/types'
import { parseCompoundWord } from './compound-utils'

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

