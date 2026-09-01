import type { GraphNode, ConnectionResult, MultiConnectionResult, NodeConnection, CompoundWord } from '@/types'
import compoundWords from '@/data/compound-words.json'
import { canChain as canChainSplit, findBestSplit, type SplitContext } from '@/lib/word-splitting'

/**
 * Common compound word part patterns
 * These are common prefixes/suffixes that form compound words
 */
const COMMON_PARTS = new Set([
  'air', 'any', 'back', 'ball', 'bed', 'bird', 'black', 'blue', 'book', 'box',
  'bread', 'break', 'butter', 'cake', 'car', 'card', 'care', 'coat', 'corn',
  'cup', 'day', 'dog', 'door', 'down', 'dream', 'drop', 'eye', 'fall', 'fire',
  'fish', 'flower', 'fly', 'foot', 'fruit', 'gold', 'grand', 'grass', 'green',
  'ground', 'gun', 'hair', 'hand', 'head', 'heart', 'high', 'hill', 'home',
  'honey', 'horse', 'hot', 'house', 'ice', 'key', 'land', 'life', 'light',
  'line', 'mail', 'man', 'meat', 'milk', 'mine', 'moon', 'mother', 'night',
  'out', 'over', 'pan', 'paper', 'pass', 'place', 'play', 'port', 'pot',
  'print', 'proof', 'rail', 'rain', 'ring', 'road', 'rock', 'room', 'sand',
  'sea', 'shine', 'ship', 'shoe', 'shop', 'side', 'silver', 'sky', 'snow',
  'some', 'son', 'star', 'step', 'stone', 'stop', 'storm', 'straw', 'sub', 'sun',
  'table', 'tail', 'thing', 'time', 'top', 'town', 'trap', 'tree', 'under',
  'up', 'walk', 'wall', 'ward', 'water', 'way', 'week', 'white', 'wind',
  'wood', 'work', 'worm', 'yard', 'berry', 'boat', 'bow', 'bush', 'chain',
  'cloth', 'craft', 'field', 'guard', 'keeper', 'knob', 'less', 'like',
  'maker', 'mark', 'master', 'mate', 'piece', 'plane', 'power', 'scape',
  'smith', 'ware', 'wheel', 'wise', 'wright', 'board', 'bridge', 'brook',
  'case', 'child', 'class', 'club', 'court', 'crew', 'cross', 'drive',
  'driver', 'farm', 'father', 'force', 'front', 'game', 'gate', 'girl',
  'glass', 'hill', 'hold', 'holder', 'iron', 'jack', 'king', 'lady', 'lane',
  'layer', 'lord', 'love', 'market', 'meal', 'mill', 'nail', 'neck', 'net',
  'news', 'note', 'pack', 'path', 'pen', 'point', 'pool', 'post', 'queen',
  'safe', 'sauce', 'school', 'shell', 'shore', 'sight', 'skin', 'spoon',
  'spring', 'stand', 'stick', 'store', 'stream', 'street', 'string', 'stroke',
  'suit', 'tea', 'tower', 'trade', 'train', 'vine', 'wave', 'well', 'wife',
  'wing', 'winter', 'woman', 'works', 'wrist', 'writer', 'year'
])

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, '')
}

function normalizeParts(parts: string[]): string[] {
  return parts
    .map((part) => normalizeWord(part))
    .filter((part) => part.length > 0)
}

const KNOWN_COMPOUND_PARTS = new Set<string>(COMMON_PARTS)
// Parts that should never be considered valid standalone words in compounds
const DISALLOWED_PARTS = new Set<string>([
  're','pre','un','non','de','dis','mis',
  'trans','inter','intra','tri','bi','mono',
  'semi','quasi','pseudo','hyper','ultra','micro','mini','maxi','auto',
  'tele','hetero','homo','iso','neo','pan','peri','poly','proto','syn','sym'
])

function markKnownParts(parts: string[]): void {
  for (const part of parts) {
    if (!part) continue
    const normalizedPart = normalizeWord(part)
    if (!normalizedPart) continue
    KNOWN_COMPOUND_PARTS.add(normalizedPart)
  }
}

const CANONICAL_PARTS = new Map<string, string[]>()

for (const entry of compoundWords as CompoundWord[]) {
  const normalizedWord = normalizeWord(entry.word)
  if (!normalizedWord) {
    continue
  }

  const normalizedParts = normalizeParts(entry.parts)
  if (normalizedParts.length >= 2) {
    CANONICAL_PARTS.set(normalizedWord, normalizedParts)
    markKnownParts(normalizedParts)
  }
}

// Runtime split context: uses KNOWN_COMPOUND_PARTS (built from bundled data
// + runtime additions) so canChain can compute boundary variants at runtime.
export const RUNTIME_SPLIT_CONTEXT: SplitContext = {
  isWord: (word) => KNOWN_COMPOUND_PARTS.has(word.toLowerCase()),
  isAllowedShortPart: (word) => COMMON_PARTS.has(word.toLowerCase()),
}

const RUNTIME_PART_OVERRIDES = new Map<string, string[]>()

function getStoredPartsForWord(normalizedWord: string): string[] | null {
  const override = RUNTIME_PART_OVERRIDES.get(normalizedWord)
  if (override) {
    return [...override]
  }

  const canonical = CANONICAL_PARTS.get(normalizedWord)
  if (canonical) {
    return [...canonical]
  }

  return null
}

export function getKnownCompoundParts(word: string): string[] | null {
  const normalizedWord = normalizeWord(word)
  if (!normalizedWord) {
    return null
  }

  const stored = getStoredPartsForWord(normalizedWord)
  return stored ? [...stored] : null
}

export function registerCompoundParts(word: string, parts: string[]): void {
  const normalizedWord = normalizeWord(word)
  if (!normalizedWord) {
    return
  }

  const normalizedParts = normalizeParts(parts)
  if (normalizedParts.length < 2) {
    return
  }

  RUNTIME_PART_OVERRIDES.set(normalizedWord, normalizedParts)
  markKnownParts(normalizedParts)
}

export function isLikelyCompoundWord(word: string, parts: string[]): boolean {
  const normalizedWord = normalizeWord(word)
  if (!normalizedWord) {
    return false
  }

  // Even if canonical/runtime exists, reject if any disallowed parts are present
  const normalizedPartsInitial = normalizeParts(parts)
  if (normalizedPartsInitial.some((p) => DISALLOWED_PARTS.has(p))) {
    return false
  }

  if (CANONICAL_PARTS.has(normalizedWord) || RUNTIME_PART_OVERRIDES.has(normalizedWord)) {
    return true
  }

  const normalizedParts = normalizedPartsInitial
  if (normalizedParts.length < 2) {
    return false
  }

  const hasInvalidShortPart = normalizedParts.some(
    (part) => part.length < 3 && !COMMON_PARTS.has(part)
  )

  if (hasInvalidShortPart) {
    return false
  }

  if (normalizedParts.join('') !== normalizedWord) {
    return false
  }

  const knownPartCount = normalizedParts.reduce(
    (count, part) => (KNOWN_COMPOUND_PARTS.has(part) ? count + 1 : count),
    0
  )

  if (knownPartCount === 0) {
    return false
  }

  return new Set(normalizedParts).size >= 2
}

export function isKnownCompoundPart(part: string): boolean {
  const normalizedPart = normalizeWord(part)
  if (!normalizedPart) {
    return false
  }
  return KNOWN_COMPOUND_PARTS.has(normalizedPart)
}

export function markCompoundPartsAsKnown(parts: string[]): void {
  markKnownParts(parts)
}

export function isCanonicalCompound(word: string): boolean {
  return CANONICAL_PARTS.has(normalizeWord(word))
}

function splitHeuristically(normalized: string): string[] {
  if (normalized.length < 4) {
    return [normalized]
  }

  // Delegate to the shared suffix-aware scorer, which scores all candidate
  // splits and picks the best one (suffix-first, doubled-consonant aware).
  const best = findBestSplit(normalized, RUNTIME_SPLIT_CONTEXT)
  if (best) {
    return best.parts
  }

  // Fallback: return the whole word as a single unsplit part
  return [normalized]
}

/**
 * Count how many parts are recognized compound components.
 */
export function countCommonCompoundParts(parts: string[]): number {
  let count = 0
  for (const part of parts) {
    if (COMMON_PARTS.has(part.toLowerCase())) {
      count++
    }
  }
  return count
}

/**
 * Parse a compound word into its constituent parts
 * Uses a greedy approach with known compound word patterns
 */
export function parseCompoundWord(word: string): string[] {
  const normalized = normalizeWord(word)
  if (!normalized) {
    return []
  }

  const stored = getStoredPartsForWord(normalized)
  if (stored && stored.length >= 2) {
    return stored
  }

  const heuristicParts = splitHeuristically(normalized)
  if (heuristicParts.length === 0) {
    return normalized ? [normalized] : []
  }

  if (heuristicParts.join('') !== normalized) {
    return [normalized]
  }

  return heuristicParts
}

/**
 * Check if two compound words share exactly one part
 * NOTE: This is kept for puzzle generation only. Gameplay uses suffix chaining.
 */
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
  
  // Must share exactly one part
  if (sharedParts.length === 1) {
    return sharedParts[0]
  }
  
  return null
}

/**
 * Validate that a new word can chain from a previous word via suffix matching.
 * Uses doubled-consonant boundary variants so e.g. "nightclub" → "clubbable"
 * works via club ↔ clubb equivalence.
 */
export function validateSuffixChain(previousWord: string, newWord: string): boolean {
  const prevParts = parseCompoundWord(previousWord)
  const newParts = parseCompoundWord(newWord)
  
  if (prevParts.length === 0 || newParts.length === 0) {
    return false
  }
  
  return canChainSplit(prevParts, newParts, RUNTIME_SPLIT_CONTEXT)
}

/**
 * Find ALL nodes that a new word can connect to via suffix chaining
 * Returns all valid connections where the node's last part matches new word's first part
 */
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
    // Skip goal node unless it's the exact word we're adding (winning move)
    if (node.isGoal && !node.isCompleted) {
      // For goal connection: the connecting word's last part must match the goal word
      // (Goal word itself is treated as a simple word with parts = [goalWord])
      const nodeLastPart = node.parts.length > 0 
        ? node.parts[node.parts.length - 1].toLowerCase()
        : node.word.toLowerCase()
      
      // Check if new word's last part matches goal word
      const newLastPart = newParts.length > 0 
        ? newParts[newParts.length - 1].toLowerCase()
        : newWord.toLowerCase()
      
      if (newLastPart === nodeLastPart && node.word.toLowerCase() === newWord.toLowerCase()) {
        // This is the winning move - connecting the exact goal word
        connections.push({ node, sharedPart: newLastPart })
        minLayer = node.layer
      }
      continue
    }
    
    // For regular nodes: check if node's last part matches new word's first part
    if (node.parts.length === 0) {
      // Simple word (start word): check if word itself matches new word's first part
      const nodeWord = node.word.toLowerCase()
      const nodeVariants = [nodeWord]
      // Also check doubled-consonant variant of the node word
      if (nodeWord.length >= 4) {
        const last = nodeWord[nodeWord.length - 1]
        const prev = nodeWord[nodeWord.length - 2]
        if (last === prev) {
          nodeVariants.push(nodeWord.slice(0, -1))
        }
      }
      const matches = nodeVariants.some(v => newParts[0].toLowerCase() === v || canChainSplit([v], newParts, RUNTIME_SPLIT_CONTEXT))
      if (matches) {
        connections.push({ node, sharedPart: newParts[0].toLowerCase() })
        const effectiveLayer = node.layer
        if (effectiveLayer >= 0 && effectiveLayer < minLayer) {
          minLayer = effectiveLayer
        }
      }
    } else {
      // Compound word: check if last part matches new word's first part
      if (canChainSplit(node.parts, newParts, RUNTIME_SPLIT_CONTEXT)) {
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

/**
 * Check if a word matches the goal
 */
export function isGoalWord(word: string, goalWord: string): boolean {
  return word.toLowerCase().replace(/[^a-z]/g, '') === 
         goalWord.toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * Generate a unique ID for a node
 */
export function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Generate a unique ID for an edge
 */
export function generateEdgeId(sourceId: string, targetId: string): string {
  return `edge-${sourceId}-${targetId}`
}

/**
 * Find the path from start to a given node
 */
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
  
  // Build adjacency list (forward direction for BFS)
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const sourceId = typeof edge.source === 'string' ? edge.source : (edge.source as GraphNode).id
    const targetId = typeof edge.target === 'string' ? edge.target : (edge.target as GraphNode).id
    if (!adjacency.has(sourceId)) adjacency.set(sourceId, [])
    adjacency.get(sourceId)!.push(targetId)
  }
  
  // BFS to find shortest path from start to target
  const visited = new Set<string>()
  const parent = new Map<string, string>()
  const queue: string[] = [startNode.id]
  visited.add(startNode.id)
  
  while (queue.length > 0) {
    const current = queue.shift()!
    
    if (current === nodeId) {
      // Found the target, reconstruct path
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
  
  // No path found, fall back to simple trace
  const path: string[] = []
  const parentMap = new Map<string, string>()
  for (const edge of edges) {
    const sourceId = typeof edge.source === 'string' ? edge.source : (edge.source as GraphNode).id
    const targetId = typeof edge.target === 'string' ? edge.target : (edge.target as GraphNode).id
    parentMap.set(targetId, sourceId)
  }
  
  let currentId: string | undefined = nodeId
  while (currentId) {
    const node = nodeMap.get(currentId)
    if (node) {
      path.unshift(node.word)
    }
    currentId = parentMap.get(currentId)
  }
  
  return path
}

