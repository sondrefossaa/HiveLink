import type { GraphNode, ConnectionResult } from '@/types'

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
  'some', 'son', 'star', 'step', 'stone', 'stop', 'storm', 'straw', 'sun',
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

/**
 * Parse a compound word into its constituent parts
 * Uses a greedy approach with known compound word patterns
 */
export function parseCompoundWord(word: string): string[] {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '')
  
  if (normalized.length < 4) {
    return [normalized]
  }

  const parts: string[] = []
  let remaining = normalized
  
  // Try to find known parts from the beginning
  while (remaining.length > 0) {
    let found = false
    
    // Try longer parts first (greedy)
    for (let len = Math.min(remaining.length, 10); len >= 3; len--) {
      const candidate = remaining.substring(0, len)
      const rest = remaining.substring(len)
      
      // Check if this is a known part AND the rest can form valid parts
      if (COMMON_PARTS.has(candidate) && (rest.length === 0 || rest.length >= 3)) {
        parts.push(candidate)
        remaining = rest
        found = true
        break
      }
    }
    
    // If no known part found, try splitting heuristically
    if (!found) {
      // If we have parts already, the rest is the final part
      if (parts.length > 0) {
        parts.push(remaining)
        break
      }
      
      // Try to find a split point using common patterns
      let bestSplit = -1
      let bestScore = 0
      
      for (let i = 3; i <= remaining.length - 3; i++) {
        const left = remaining.substring(0, i)
        const right = remaining.substring(i)
        let score = 0
        
        if (COMMON_PARTS.has(left)) score += 2
        if (COMMON_PARTS.has(right)) score += 2
        if (left.length >= 4 && left.length <= 7) score += 1
        if (right.length >= 4 && right.length <= 7) score += 1
        
        if (score > bestScore) {
          bestScore = score
          bestSplit = i
        }
      }
      
      if (bestSplit > 0 && bestScore > 0) {
        parts.push(remaining.substring(0, bestSplit))
        remaining = remaining.substring(bestSplit)
      } else {
        // Can't split, treat as single part
        parts.push(remaining)
        break
      }
    }
  }
  
  return parts.filter(p => p.length > 0)
}

/**
 * Check if two compound words share exactly one part
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
 * Check if a new word can connect to any existing node in the graph
 */
export function canConnect(
  newWord: string,
  newParts: string[],
  existingNodes: GraphNode[]
): ConnectionResult {
  // Find all possible connections
  const connections: Array<{ node: GraphNode; sharedPart: string; newPart: string }> = []
  
  for (const node of existingNodes) {
    // Skip the goal node (we connect TO it, not FROM it, unless completing)
    if (node.isGoal && !node.isCompleted) {
      const sharedPart = findSharedPart(node.parts, newParts)
      if (sharedPart && node.word.toLowerCase() === newWord.toLowerCase()) {
        // This is the winning move!
        return {
          canConnect: true,
          parentNode: node,
          sharedPart,
          newPart: newParts.find(p => p.toLowerCase() !== sharedPart.toLowerCase()) || '',
        }
      }
      continue
    }
    
    const sharedPart = findSharedPart(node.parts, newParts)
    if (sharedPart) {
      const newPart = newParts.find(p => p.toLowerCase() !== sharedPart.toLowerCase())
      if (newPart) {
        connections.push({ node, sharedPart, newPart })
      }
    }
  }
  
  if (connections.length === 0) {
    return { canConnect: false }
  }
  
  // Prefer connecting to the node with the highest layer (most progress)
  connections.sort((a, b) => b.node.layer - a.node.layer)
  const best = connections[0]
  
  return {
    canConnect: true,
    parentNode: best.node,
    sharedPart: best.sharedPart,
    newPart: best.newPart,
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
  const path: string[] = []
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  
  // Build adjacency list (reverse direction to trace back)
  const parentMap = new Map<string, string>()
  for (const edge of edges) {
    const sourceId = typeof edge.source === 'string' ? edge.source : (edge.source as GraphNode).id
    const targetId = typeof edge.target === 'string' ? edge.target : (edge.target as GraphNode).id
    parentMap.set(targetId, sourceId)
  }
  
  // Trace back from the target node
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

