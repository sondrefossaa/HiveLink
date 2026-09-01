// lib/compound-utils.ts
// Norwegian compound word utilities.
// Norsk Ordbank decomposition is authoritative; runtime guessing is fallback only.

import type { GraphNode, ConnectionResult, MultiConnectionResult, NodeConnection, CompoundWord } from '@/types'
import compoundWords from '@/data/compound-words.json'
import { canChain, findBestSplit, type SplitContext } from '@/lib/word-splitting'
import { isCompoundPart, isCommonWord, normalizeNo } from '@/lib/norwegian-dictionary'

const KNOWN_COMPOUND_PARTS = new Set<string>()
const CANONICAL_PARTS = new Map<string, string[]>()
const CANONICAL_FUGE = new Map<string, string>()

for (const entry of compoundWords as CompoundWord[]) {
  const normalizedWord = normalizeNo(entry.word)
  if (!normalizedWord) continue

  const normalizedParts = entry.parts.map(p => normalizeNo(p)).filter(Boolean)
  if (normalizedParts.length >= 2) {
    CANONICAL_PARTS.set(normalizedWord, normalizedParts)
    if ((entry as CompoundWord & { fuge?: string }).fuge) {
      CANONICAL_FUGE.set(normalizedWord, (entry as CompoundWord & { fuge?: string }).fuge!)
    }
    for (const part of normalizedParts) {
      KNOWN_COMPOUND_PARTS.add(part)
    }
  }
}

export const RUNTIME_SPLIT_CONTEXT: SplitContext = {
  isWord: (word) => isCompoundPart(word) || KNOWN_COMPOUND_PARTS.has(normalizeNo(word)),
  isCommon: (word) => isCommonWord(word),
}

const RUNTIME_PART_OVERRIDES = new Map<string, string[]>()

function getStoredPartsForWord(normalizedWord: string): string[] | null {
  const override = RUNTIME_PART_OVERRIDES.get(normalizedWord)
  if (override) return [...override]
  const canonical = CANONICAL_PARTS.get(normalizedWord)
  if (canonical) return [...canonical]
  return null
}

export function getKnownCompoundParts(word: string): string[] | null {
  const normalized = normalizeNo(word)
  if (!normalized) return null
  const stored = getStoredPartsForWord(normalized)
  return stored ? [...stored] : null
}

export function registerCompoundParts(word: string, parts: string[]): void {
  const normalized = normalizeNo(word)
  if (!normalized) return
  const normalizedParts = parts.map(p => normalizeNo(p)).filter(Boolean)
  if (normalizedParts.length < 2) return
  RUNTIME_PART_OVERRIDES.set(normalized, normalizedParts)
  for (const part of normalizedParts) {
    KNOWN_COMPOUND_PARTS.add(part)
  }
}

export function isLikelyCompoundWord(word: string, parts: string[]): boolean {
  const normalized = normalizeNo(word)
  if (!normalized) return false
  if (CANONICAL_PARTS.has(normalized) || RUNTIME_PART_OVERRIDES.has(normalized)) return true
  const normalizedParts = parts.map(p => normalizeNo(p)).filter(Boolean)
  if (normalizedParts.length < 2) return false
  if (normalizedParts.join('') !== normalized) return false
  const knownPartCount = normalizedParts.reduce(
    (count, part) => (KNOWN_COMPOUND_PARTS.has(part) || isCompoundPart(part) ? count + 1 : count),
    0
  )
  if (knownPartCount === 0) return false
  return new Set(normalizedParts).size >= 2
}

export function isKnownCompoundPart(part: string): boolean {
  const normalized = normalizeNo(part)
  if (!normalized) return false
  return KNOWN_COMPOUND_PARTS.has(normalized) || isCompoundPart(normalized)
}

export function markCompoundPartsAsKnown(parts: string[]): void {
  for (const part of parts) {
    const normalized = normalizeNo(part)
    if (normalized) KNOWN_COMPOUND_PARTS.add(normalized)
  }
}

export function isCanonicalCompound(word: string): boolean {
  return CANONICAL_PARTS.has(normalizeNo(word))
}

function splitHeuristically(normalized: string): string[] {
  if (normalized.length < 4) return [normalized]
  const best = findBestSplit(normalized, RUNTIME_SPLIT_CONTEXT)
  if (best) return best.parts
  return [normalized]
}

export function countCommonCompoundParts(parts: string[]): number {
  let count = 0
  for (const part of parts) {
    if (isCommonWord(part) || isCompoundPart(part)) count++
  }
  return count
}

export function parseCompoundWord(word: string): string[] {
  const normalized = normalizeNo(word)
  if (!normalized) return []
  const stored = getStoredPartsForWord(normalized)
  if (stored && stored.length >= 2) return stored
  const heuristicParts = splitHeuristically(normalized)
  if (heuristicParts.length === 0) return normalized ? [normalized] : []
  if (heuristicParts.join('') !== normalized) return [normalized]
  return heuristicParts
}

export function findSharedPart(partsA: string[], partsB: string[]): string | null {
  const sharedParts: string[] = []
  for (const partA of partsA) {
    for (const partB of partsB) {
      if (partA.toLowerCase() === partB.toLowerCase()) {
        if (!sharedParts.includes(partA.toLowerCase())) {
          sharedParts.push(partA.toLowerCase())
        }
      }
    }
  }
  if (sharedParts.length === 1) return sharedParts[0]
  return null
}

export function validateSuffixChain(previousWord: string, newWord: string): boolean {
  const prevParts = parseCompoundWord(previousWord)
  const newParts = parseCompoundWord(newWord)
  if (prevParts.length === 0 || newParts.length === 0) return false
  return canChain(prevParts, newParts, RUNTIME_SPLIT_CONTEXT)
}

export function findSuffixConnections(
  newWord: string,
  newParts: string[],
  existingNodes: GraphNode[]
): MultiConnectionResult {
  const connections: NodeConnection[] = []
  let minLayer = Infinity

  if (newParts.length === 0) {
    return { canConnect: false, connections: [], minLayer: 0 }
  }

  for (const node of existingNodes) {
    if (node.isGoal && !node.isCompleted) {
      const nodeLastPart = node.parts.length > 0
        ? node.parts[node.parts.length - 1].toLowerCase()
        : node.word.toLowerCase()
      const newLastPart = newParts.length > 0
        ? newParts[newParts.length - 1].toLowerCase()
        : newWord.toLowerCase()
      if (newLastPart === nodeLastPart && node.word.toLowerCase() === newWord.toLowerCase()) {
        connections.push({ node, sharedPart: newLastPart })
        minLayer = node.layer
      }
      continue
    }

    if (node.parts.length === 0) {
      const nodeWord = node.word.toLowerCase()
      const matches = newParts[0].toLowerCase() === nodeWord || canChain([nodeWord], newParts, RUNTIME_SPLIT_CONTEXT)
      if (matches) {
        connections.push({ node, sharedPart: newParts[0].toLowerCase() })
        const effectiveLayer = node.layer
        if (effectiveLayer >= 0 && effectiveLayer < minLayer) {
          minLayer = effectiveLayer
        }
      }
    } else {
      if (canChain(node.parts, newParts, RUNTIME_SPLIT_CONTEXT)) {
        const nodeLastPart = node.parts[node.parts.length - 1].toLowerCase()
        connections.push({ node, sharedPart: nodeLastPart })
        const effectiveLayer = node.layer
        if (effectiveLayer >= 0 && effectiveLayer < minLayer) {
          minLayer = effectiveLayer
        }
      }
    }
  }

  if (connections.length === 0) {
    return { canConnect: false, connections: [], minLayer: 0 }
  }

  return {
    canConnect: true,
    connections,
    minLayer: minLayer === Infinity ? 0 : minLayer,
  }
}

export function isGoalWord(word: string, goalWord: string): boolean {
  return normalizeNo(word) === normalizeNo(goalWord)
}

export function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function generateEdgeId(sourceId: string, targetId: string): string {
  return `edge-${sourceId}-${targetId}`
}

export function findPathToNode(
  nodeId: string,
  nodes: GraphNode[],
  edges: Array<{ source: string; target: string }>
): string[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const startNode = nodes.find(n => n.isStart)

  if (!startNode) return []
  if (nodeId === startNode.id) {
    const node = nodeMap.get(nodeId)
    return node ? [node.word] : []
  }

  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const sourceId = typeof edge.source === 'string' ? edge.source : (edge.source as GraphNode).id
    const targetId = typeof edge.target === 'string' ? edge.target : (edge.target as GraphNode).id
    if (!adjacency.has(sourceId)) adjacency.set(sourceId, [])
    adjacency.get(sourceId)!.push(targetId)
  }

  const visited = new Set<string>()
  const parent = new Map<string, string>()
  const queue: string[] = [startNode.id]
  visited.add(startNode.id)

  while (queue.length > 0) {
    const current = queue.shift()!

    if (current === nodeId) {
      const path: string[] = []
      let curr: string | undefined = nodeId
      while (curr) {
        const node = nodeMap.get(curr)
        if (node) path.unshift(node.word)
        curr = parent.get(curr)
      }
      return path
    }

    const neighbors = adjacency.get(current) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        parent.set(neighbor, current)
        queue.push(neighbor)
      }
    }
  }

  // BFS failed, try reverse parent trace
  const parentMap = new Map<string, string>()
  for (const edge of edges) {
    const sourceId = typeof edge.source === 'string' ? edge.source : (edge.source as GraphNode).id
    const targetId = typeof edge.target === 'string' ? edge.target : (edge.target as GraphNode).id
    parentMap.set(targetId, sourceId)
  }

  const path: string[] = []
  let currentId: string | undefined = nodeId
  while (currentId) {
    const node = nodeMap.get(currentId)
    if (node) path.unshift(node.word)
    currentId = parentMap.get(currentId)
  }

  return path
}
