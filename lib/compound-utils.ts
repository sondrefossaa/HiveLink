import type { GraphNode, MultiConnectionResult, NodeConnection } from '@/types'
import { findMatchingKey } from '@/lib/dictionary'
import { normalizeNo } from '@/lib/norwegian-dictionary'

export function findSuffixConnections(
  _newWord: string,
  newParts: string[],
  existingNodes: GraphNode[],
  incomingKeys?: string[]
): MultiConnectionResult {
  const connections: NodeConnection[] = []
  let minLayer = Infinity
  const candidateIncoming = incomingKeys ?? [newParts[0]].filter(Boolean)
  if (candidateIncoming.length === 0) return { canConnect: false, connections: [], minLayer: 0 }

  for (const node of existingNodes) {
    if (node.isGoal) continue
    const nodeOutgoing = node.outgoingKeys ?? (node.isStart
      ? [normalizeNo(node.word)]
      : [node.parts.at(-1) ?? node.word])
    const sharedPart = findMatchingKey(nodeOutgoing, candidateIncoming)
    if (!sharedPart) continue
    connections.push({ node, sharedPart })
    if (node.layer >= 0 && node.layer < minLayer) minLayer = node.layer
  }

  return connections.length > 0
    ? { canConnect: true, connections, minLayer: minLayer === Infinity ? 0 : minLayer }
    : { canConnect: false, connections: [], minLayer: 0 }
}

export function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export function generateEdgeId(sourceId: string, targetId: string): string {
  return `edge-${sourceId}-${targetId}`
}
