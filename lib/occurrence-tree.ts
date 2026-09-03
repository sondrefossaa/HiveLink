import type { GraphEdge, GraphNode, NodeConnection } from '@/types'

export const OCCURRENCE_TREE_STATE_VERSION = 3

const normalizedWord = (word: string): string => word.normalize('NFC').toLocaleLowerCase('nb-NO')

export function ensureGoalPreview(nodes: GraphNode[], goalWord: string): GraphNode[] {
  // Single shared goal: exactly one floating marker, never parented and
  // never duplicated. Legacy saves may contain completed `goal-<id>`
  // duplicates with a parentId — collapse them to one floating node that
  // preserves completion so old wins are not lost.
  const goalNodes = nodes.filter((node) => node.isGoal)
  const floating = goalNodes.find((node) => !node.parentId)
  const wasComplete = goalNodes.some((node) => node.isCompleted)
  const withoutGoals = nodes.filter((node) => !node.isGoal)

  if (floating) {
    const deduped: GraphNode[] = [
      ...withoutGoals,
      wasComplete && !floating.isCompleted
        ? { ...floating, isCompleted: true }
        : floating,
    ]
    // If there were legacy duplicates, their count changed — return deduped.
    // Otherwise the single preview already exists.
    return deduped
  }

  const normalizedGoal = normalizedWord(goalWord)
  return [...withoutGoals, {
    id: 'goal',
    word: goalWord,
    parts: [goalWord],
    incomingKeys: [normalizedGoal],
    outgoingKeys: [normalizedGoal],
    layer: -1,
    isStart: false,
    isGoal: true,
    isCompleted: wasComplete,
  }]
}

export function chooseOccurrenceParent(
  connections: NodeConnection[],
  selectedNodeId: string | null,
  nodes: GraphNode[],
  edges: GraphEdge[],
  word: string
): NodeConnection | null {
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const normalized = normalizedWord(word)

  const available = connections.filter(({ node }) => {
    if (node.isGoal) return false

    let ancestor: GraphNode | undefined = node
    const visited = new Set<string>()
    while (ancestor) {
      if (visited.has(ancestor.id) || normalizedWord(ancestor.word) === normalized) return false
      visited.add(ancestor.id)
      ancestor = ancestor.parentId ? nodeById.get(ancestor.parentId) : undefined
    }

    return !edges.some((edge) => {
      if (edge.source !== node.id) return false
      const child = nodeById.get(String(edge.target))
      return child && !child.isGoal && normalizedWord(child.word) === normalized
    })
  })

  const selected = available.find(({ node }) => node.id === selectedNodeId)
  if (selected) return selected

  return [...available].sort((a, b) => {
    const layerDifference = a.node.layer - b.node.layer
    if (layerDifference !== 0) return layerDifference
    return (nodeIndex.get(b.node.id) ?? -1) - (nodeIndex.get(a.node.id) ?? -1)
  })[0] ?? null
}

export function traceOccurrencePath(
  nodeId: string,
  nodes: GraphNode[]
): { nodeIds: string[]; words: string[] } | null {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const visited = new Set<string>()
  const reversed: GraphNode[] = []
  let current = nodeById.get(nodeId)

  while (current) {
    if (visited.has(current.id)) return null
    visited.add(current.id)
    reversed.push(current)

    if (current.isStart) {
      const path = reversed.reverse()
      return {
        nodeIds: path.map((node) => node.id),
        words: path.map((node) => node.word),
      }
    }

    current = current.parentId ? nodeById.get(current.parentId) : undefined
  }

  return null
}

export function isDistinctWordPath(path: string[], paths: string[][]): boolean {
  const key = path.map(normalizedWord).join('\u0000')
  return !paths.some((existing) => existing.map(normalizedWord).join('\u0000') === key)
}
