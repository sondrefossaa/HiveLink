import type { GraphEdge, GraphNode, NodeConnection } from '@/types'

export const OCCURRENCE_TREE_STATE_VERSION = 2

const normalizedWord = (word: string): string => word.normalize('NFC').toLocaleLowerCase('nb-NO')

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
