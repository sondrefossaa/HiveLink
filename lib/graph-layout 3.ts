import type { GraphEdge, GraphNode } from '@/types'

export const FIXED_HORIZONTAL_SPACING = 100 // For backward compatibility with Graph.tsx
const BASE_CANVAS_SIZE = 640
const MIN_VERTICAL_SCALE = 1
const MAX_VERTICAL_SCALE = 1.8

// Animation constants
const ANIMATION_DURATION = 600 // milliseconds

// Layout constants (v3)
const LAYER_HORIZONTAL_SPACING = 320
const CHILD_VERTICAL_SPACING = 110
const MIN_SUBTREE_GAP = 60
const START_X = 140

// Additional constants from second codebase
const BASE_FORWARD_CONFLICT_SPACING = 150
const MIN_GOAL_LAYER = 3
const MAX_GOAL_LAYER = 12
const MAX_OFFSET_STEPS = 10
const MIN_LAYER_SPACING = 48

type BranchKind = 'origin' | 'forward' | 'side'

/**
 * Easing function for smooth animation (ease-in-out cubic)
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Interpolate between two positions based on progress (0-1)
 */
export function interpolatePosition(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  progress: number
): { x: number; y: number } {
  const eased = easeInOutCubic(progress)
  return {
    x: startX + (endX - startX) * eased,
    y: startY + (endY - startY) * eased,
  }
}

interface Position {
  x: number
  y: number
}

interface AnimationState {
  startPos: Position
  endPos: Position
  startTime: number
}

/**
 * Animation manager for smooth node position transitions
 * Lives in graph-layout to keep animation logic centralized
 */
class LayoutAnimationManager {
  private previousPositions = new Map<string, Position>()
  private activeAnimations = new Map<string, AnimationState>()
  private prefersReducedMotion = false

  constructor() {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      this.prefersReducedMotion = mediaQuery.matches
      const handleChange = (e: MediaQueryListEvent) => {
        this.prefersReducedMotion = e.matches
      }
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange)
      } else {
        mediaQuery.addListener(handleChange)
      }
    }
  }

  /**
   * Update target positions and start animations if positions changed
   * Returns map of current positions (immediate if no animation, start pos if animating)
   */
  updateTargets(
    nodes: Array<{ id: string; targetX: number; targetY: number; parentId?: string }>
  ): Map<string, Position> {
    const currentTime = performance.now()
    const currentPositions = new Map<string, Position>()

    // Build a map of all node target positions for parent lookups
    const targetPositionsMap = new Map<string, Position>()
    nodes.forEach((node) => {
      targetPositionsMap.set(node.id, { x: node.targetX, y: node.targetY })
    })

    // Get all current positions (including animating ones) to use for parent lookups
    // This ensures we can get parent positions even if they're currently animating
    const allCurrentPositions = new Map<string, Position>()
    this.previousPositions.forEach((pos, id) => {
      allCurrentPositions.set(id, pos)
    })
    // Merge in any currently animating positions
    const animatingPositions = this.getCurrentPositions(currentTime)
    animatingPositions.forEach((pos, id) => {
      allCurrentPositions.set(id, pos)
    })

    nodes.forEach((node) => {
      const prevPos = this.previousPositions.get(node.id)
      const targetPos: Position = { x: node.targetX, y: node.targetY }

      if (this.prefersReducedMotion) {
        // No animation - set immediately
        currentPositions.set(node.id, targetPos)
        this.previousPositions.set(node.id, targetPos)
        this.activeAnimations.delete(node.id)
      } else if (!prevPos) {
        // New node - start from parent's position if available
        let startPos: Position = targetPos

        if (node.parentId) {
          // First try to get parent's current animated position (if parent is animating)
          let parentPos = allCurrentPositions.get(node.parentId)
          
          // If parent not in current positions, try to get from target positions (parent might also be new)
          if (!parentPos) {
            const parentTargetPos = targetPositionsMap.get(node.parentId)
            if (parentTargetPos) {
              // Parent exists in this batch - check if parent has previous position
              const parentPrevPos = this.previousPositions.get(node.parentId)
              // Use parent's previous position if available, otherwise use parent's target
              parentPos = parentPrevPos ?? parentTargetPos
            }
          }
          
          if (parentPos) {
            startPos = parentPos
          }
        }

        // If starting position is different from target, animate
        const distance = Math.sqrt(
          Math.pow(targetPos.x - startPos.x, 2) + Math.pow(targetPos.y - startPos.y, 2)
        )

        if (distance > 1) {
          // Start animation from parent's position (or fallback)
          this.activeAnimations.set(node.id, {
            startPos,
            endPos: targetPos,
            startTime: currentTime,
          })
          currentPositions.set(node.id, startPos)
          // Don't update previousPositions yet - let animation update it
        } else {
          // Positions are the same, no animation needed
          currentPositions.set(node.id, targetPos)
          this.previousPositions.set(node.id, targetPos)
        }
      } else {
        // Existing node - check if position changed
        const distance = Math.sqrt(
          Math.pow(targetPos.x - prevPos.x, 2) + Math.pow(targetPos.y - prevPos.y, 2)
        )

        if (distance < 1) {
          // Position hasn't changed significantly
          currentPositions.set(node.id, prevPos)
        } else {
          // Start animation - begin at previous position
          this.activeAnimations.set(node.id, {
            startPos: prevPos,
            endPos: targetPos,
            startTime: currentTime,
          })
          currentPositions.set(node.id, prevPos)
        }
      }
    })

    return currentPositions
  }

  /**
   * Get current interpolated positions for all active animations at given time
   */
  getCurrentPositions(currentTime: number = performance.now()): Map<string, Position> {
    const currentPositions = new Map<string, Position>()

    this.activeAnimations.forEach((animation, nodeId) => {
      const elapsed = currentTime - animation.startTime
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1)

      if (progress >= 1) {
        // Animation complete
        currentPositions.set(nodeId, animation.endPos)
        this.previousPositions.set(nodeId, animation.endPos)
        this.activeAnimations.delete(nodeId)
      } else {
        // Interpolate current position
        const currentPos = interpolatePosition(
          animation.startPos.x,
          animation.startPos.y,
          animation.endPos.x,
          animation.endPos.y,
          progress
        )
        currentPositions.set(nodeId, currentPos)
        this.previousPositions.set(nodeId, currentPos)
      }
    })

    return currentPositions
  }

  /**
   * Check if any animations are currently active
   */
  hasActiveAnimations(): boolean {
    return this.activeAnimations.size > 0
  }

  /**
   * Get position for a node (current if animating, previous otherwise, or fallback)
   */
  getPosition(nodeId: string, fallback: Position): Position {
    const currentTime = performance.now()
    const currentAnimations = this.getCurrentPositions(currentTime)
    return (
      currentAnimations.get(nodeId) ||
      this.previousPositions.get(nodeId) ||
      fallback
    )
  }

  /**
   * Clear all animations and positions
   */
  reset(): void {
    this.previousPositions.clear()
    this.activeAnimations.clear()
  }
}

// Global animation manager instance
const animationManager = new LayoutAnimationManager()

/**
 * Get the animation manager instance (for use in Graph.tsx)
 */
export function getAnimationManager(): LayoutAnimationManager {
  return animationManager
}

/**
 * Interface for tracking node positions during layout
 */
interface NodePosition {
  y: number
  layer: number
  parentId?: string
  minY?: number // Subtree bounding box
  maxY?: number // Subtree bounding box
  branchType?: BranchKind // Add branch type information
}

export interface LayoutNodeMeta extends GraphNode {
  targetX: number
  targetY: number
  absoluteY: number
  parentId?: string
  computedLayer: number
  branchType: BranchKind // Add branch type
}

export interface GraphLayoutResult {
  nodes: LayoutNodeMeta[]
  nodeMeta: Map<string, LayoutNodeMeta>
  maxLayer: number
  goalLayer: number
  startNodeId?: string
  goalNodeId?: string
  farthestNodeId?: string
  boundingBox: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    centerX: number
    centerY: number
    width: number
    height: number
  }
}

const resolveNodeId = (endpoint: string | GraphNode): string =>
  typeof endpoint === 'string' ? endpoint : endpoint.id

const clampValue = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

function determineBranchKind(
  edge: GraphEdge | undefined,
  parentNode: GraphNode | undefined,
  childNode: GraphNode
): BranchKind {
  if (!edge || !parentNode) {
    return childNode.expandsForward === false ? 'side' : 'forward'
  }

  const sharedPart = edge.sharedPart?.toLowerCase() ?? ''
  const parentParts = parentNode.parts.map((part) => part.toLowerCase())

  if (parentParts.length === 0) {
    return childNode.expandsForward === false ? 'side' : 'forward'
  }

  const lastPart = parentParts[parentParts.length - 1]
  const firstPart = parentParts[0]

  if (sharedPart && sharedPart === lastPart) {
    return 'forward'
  }

  if (sharedPart && sharedPart === firstPart) {
    return 'side'
  }

  if (childNode.expandsForward !== undefined) {
    return childNode.expandsForward ? 'forward' : 'side'
  }

  return 'forward'
}

function buildLayerMap(
  startNodeId: string,
  adjacency: Map<string, string[]>,
  nodeMap: Map<string, GraphNode>,
  edgeMap: Map<string, GraphEdge>,
  goalNodeId?: string
): Map<string, number> {
  const layerMap = new Map<string, number>()
  const queue: string[] = []

  layerMap.set(startNodeId, 0)
  queue.push(startNodeId)

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const currentLayer = layerMap.get(currentId) ?? 0
    const currentNode = nodeMap.get(currentId)
    const children = adjacency.get(currentId) ?? []

    for (const childId of children) {
      if (childId === goalNodeId) continue
      
      const childNode = nodeMap.get(childId)
      const edge = edgeMap.get(`${currentId}->${childId}`)
      
      // Determine if this is a forward or side expansion
      const branchKind = determineBranchKind(edge, currentNode, childNode!)
      
      // First layer (from start): always increment to layer 1
      // Forward expansion: increment layer
      // Side expansion: same layer as parent
      const isFromStart = currentId === startNodeId
      const nextLayer = (isFromStart || branchKind === 'forward') ? currentLayer + 1 : currentLayer
      
      if (!layerMap.has(childId) || nextLayer < (layerMap.get(childId) ?? Infinity)) {
        layerMap.set(childId, nextLayer)
        queue.push(childId)
      }
    }
  }

  return layerMap
}

function selectPrimaryParent(
  nodeId: string,
  incoming: Map<string, string[]>,
  layerMap: Map<string, number>,
  goalNodeId?: string
): string | undefined {
  const parents = incoming.get(nodeId) ?? []
  if (parents.length === 0) return undefined

  // For side branches when extending the FIRST word:
  // Choose the parent with the LOWEST layer (earliest in the chain)
  // This creates branches from earlier nodes rather than chaining from the most recent
  let chosen: string | undefined
  let bestLayer = Infinity // Changed from -Infinity to Infinity

  for (const parentId of parents) {
    if (parentId === goalNodeId && parents.length > 1) continue
    const parentLayer = layerMap.get(parentId) ?? Infinity
    if (parentLayer < bestLayer) { // Changed from > to <
      bestLayer = parentLayer
      chosen = parentId
    }
  }

  return chosen ?? parents[0]
}

/**
 * Rebalance layer positions for clean, centered layout
 * This function from the second codebase helps with better side branch positioning
 */
function rebalanceLayerPositions(
  positions: Map<string, NodePosition>,
  childrenMap: Map<string, string[]>,
  parentsMap: Map<string, string[]>,
  centerCrossAxis: number,
  layerMap: Map<string, number>
): void {
  // Group nodes by layer
  const nodesByLayer = new Map<number, string[]>()
  for (const [nodeId, position] of positions.entries()) {
    const layer = position.layer
    if (!nodesByLayer.has(layer)) {
      nodesByLayer.set(layer, [])
    }
    nodesByLayer.get(layer)!.push(nodeId)
  }
  
  // Count descendants for each node (nodes with more descendants = more important paths)
  const descendantCount = new Map<string, number>()
  
  const countDescendants = (nodeId: string, visited: Set<string> = new Set()): number => {
    if (visited.has(nodeId)) return 0
    if (descendantCount.has(nodeId)) return descendantCount.get(nodeId)!
    
    visited.add(nodeId)
    const children = childrenMap.get(nodeId) || []
    let count = children.length
    
    for (const childId of children) {
      count += countDescendants(childId, visited)
    }
    
    descendantCount.set(nodeId, count)
    return count
  }
  
  // Calculate descendant counts for all nodes
  for (const [nodeId] of positions.entries()) {
    countDescendants(nodeId)
  }
  
  // Iterative relaxation: adjust positions to minimize crossings and balance spacing
  const iterations = 3
  for (let iter = 0; iter < iterations; iter++) {
    const layers = Array.from(nodesByLayer.keys()).sort((a, b) => a - b)
    
    // Forward pass: adjust based on parent positions
    for (const layer of layers) {
      const nodeIds = nodesByLayer.get(layer)!
      if (nodeIds.length <= 1) continue
      
      // Calculate barycenter (weighted average of parent/child positions)
      // Weight children more heavily than parents since we want to point toward goal
      const barycenters = nodeIds.map((nodeId) => {
        const parents = parentsMap.get(nodeId) || []
        const children = childrenMap.get(nodeId) || []
        const hasDescendants = (descendantCount.get(nodeId) || 0) > 0
        const nodePos = positions.get(nodeId)!
        
        let sum = 0
        let count = 0
        
        // Parents have lower weight
        for (const parentId of parents) {
          const parentPos = positions.get(parentId)
          if (parentPos) {
            sum += parentPos.y * 0.5
            count += 0.5
          }
        }
        
        // Children have higher weight - they pull the node toward the path to goal
        for (const childId of children) {
          const childPos = positions.get(childId)
          if (childPos) {
            sum += childPos.y * 1.5
            count += 1.5
          }
        }
        
        // Nodes with descendants get pulled toward center
        if (hasDescendants) {
          const descendantWeight = Math.min((descendantCount.get(nodeId) || 0) * 0.3, 2)
          sum += centerCrossAxis * descendantWeight
          count += descendantWeight
        }
        
        const barycenter = count > 0 ? sum / count : nodePos.y
        return { nodeId, barycenter, hasDescendants }
      })
      
      // Sort by barycenter to reduce crossings, but keep nodes with descendants closer to center
      // Nodes with descendants should be sorted toward the middle of the array
      barycenters.sort((a, b) => {
        // Both have descendants or both don't - sort by barycenter
        if (a.hasDescendants === b.hasDescendants) {
          return a.barycenter - b.barycenter
        }
        // Node with descendants should be closer to center
        // If a has descendants, it should be closer to middle position
        // Compare distance from center
        const aDist = Math.abs(a.barycenter - centerCrossAxis)
        const bDist = Math.abs(b.barycenter - centerCrossAxis)
        if (a.hasDescendants && !b.hasDescendants) {
          // a should be more centered - if a is already more centered, keep order
          return aDist - bDist - 50 // bias a toward center
        }
        return bDist - aDist + 50 // bias b away from center
      })
      
      // Redistribute with even spacing
      const totalNodes = barycenters.length
      const currentPositions = barycenters.map(b => positions.get(b.nodeId)!.y)
      const minPos = Math.min(...currentPositions)
      const maxPos = Math.max(...currentPositions)
      const range = maxPos - minPos
      
      // Use larger of: current spread or minimum spacing requirements
      const minSpacing = 60
      const minRequiredSpread = minSpacing * (totalNodes - 1)
      const actualSpread = Math.max(range, minRequiredSpread)
      
      // Calculate starting position to center the group
      const startPos = centerCrossAxis - actualSpread / 2
      
      // Assign new positions with even spacing
      barycenters.forEach((item, index) => {
        const nodePos = positions.get(item.nodeId)!
        const idealPos = startPos + (index * actualSpread / Math.max(totalNodes - 1, 1))
        
        // Nodes with descendants get pulled more strongly toward their ideal (centered) position
        const descendantBonus = item.hasDescendants ? 0.15 : 0
        const blendFactor = (iter === iterations - 1 ? 0.8 : 0.5) + descendantBonus
        nodePos.y = nodePos.y * (1 - blendFactor) + idealPos * blendFactor
      })
    }
  }
}

/**
 * MAIN LAYOUT FUNCTION - Graph Layout System v3 with side branching logic
 * Deterministic 3-phase tree layout with collision-free guarantees and proper side branching
 */
export function computeGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  canvasCrossAxisSize: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
  spacingMultiplier: number = 100,
  autoBalance: boolean = true,
  existingPositions?: Map<string, { x: number; y: number }>
): GraphLayoutResult {
  const startNode = nodes.find((node) => node.isStart)
  const goalNode = nodes.find((node) => node.id === 'goal') || nodes.find((node) => node.isGoal)
  
  if (!startNode) {
    throw new Error('Start node is required')
  }
  
  const safeCanvasSize = Math.max(canvasCrossAxisSize, 480)
  const scale = Math.max(
    MIN_VERTICAL_SCALE,
    Math.min(MAX_VERTICAL_SCALE, safeCanvasSize / BASE_CANVAS_SIZE)
  )
  const forwardConflictUnit = BASE_FORWARD_CONFLICT_SPACING * scale
  const crossAxisMargin = Math.max(MIN_LAYER_SPACING, forwardConflictUnit * 0.5)
  
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  
  // Build adjacency and incoming maps
  const adjacency = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  const edgeMap = new Map<string, GraphEdge>() // Map edge id to edge for quick lookup
  
  edges.forEach((edge) => {
    const sourceId = resolveNodeId(edge.source)
    const targetId = resolveNodeId(edge.target)
    
    if (!adjacency.has(sourceId)) adjacency.set(sourceId, [])
    adjacency.get(sourceId)!.push(targetId)
    
    if (!incoming.has(targetId)) incoming.set(targetId, [])
    incoming.get(targetId)!.push(sourceId)
    
    // Store edge by (source, target) for quick lookup
    edgeMap.set(`${sourceId}->${targetId}`, edge)
  })
  
  // Calculate layers for all nodes using the side-branch-aware algorithm
  const layerMap = buildLayerMap(startNode.id, adjacency, nodeMap, edgeMap, goalNode?.id)

  nodes.forEach((node) => {
    if (!layerMap.has(node.id)) {
      const fallbackLayer = node.layer >= 0 ? node.layer : 0
      layerMap.set(node.id, fallbackLayer)
    }
  })
  
  // Calculate max layer and goal layer
  const nonGoalLayers = nodes
    .filter((node) => node.id !== 'goal')
    .map((node) => layerMap.get(node.id) ?? 0)
  
  const maxLayer = nonGoalLayers.length > 0 ? Math.max(...nonGoalLayers) : 0
  const goalLayer = maxLayer + 1
  
  // Build parent-child tree structure with side branch detection
  const parentMap = new Map<string, string | undefined>()
  const childrenMap = new Map<string, string[]>()
  const parentsMap = new Map<string, string[]>()
  
  // Initialize children map and parents map
  nodes.forEach((node) => {
    if (!node.isStart && node.id !== goalNode?.id) {
      const parentId = selectPrimaryParent(node.id, incoming, layerMap, goalNode?.id)
      parentMap.set(node.id, parentId)
      
      if (parentId) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, [])
        }
        childrenMap.get(parentId)!.push(node.id)
        
        if (!parentsMap.has(node.id)) {
          parentsMap.set(node.id, [])
        }
        parentsMap.get(node.id)!.push(parentId)
      }
    }
  })
  
  // Initialize positions map with branch type information
  const positions = new Map<string, NodePosition>()
  
  // Initialize all nodes with their layer and branch type
  nodes.forEach((node) => {
    let layer = layerMap.get(node.id) ?? 0
    if (node.id === goalNode?.id) {
      layer = goalLayer
    }
    
    const parentId = parentMap.get(node.id)
    const edgeKey = parentId ? `${parentId}->${node.id}` : undefined
    const connectingEdge = edgeKey ? edgeMap.get(edgeKey) : undefined
    const parentNode = parentId ? nodeMap.get(parentId) : undefined
    const branchType = determineBranchKind(connectingEdge, parentNode, node)
    
    positions.set(node.id, {
      y: safeCanvasSize / 2, // Start at center, will be adjusted
      layer,
      parentId,
      branchType,
    })
  })
  
  // Apply the rebalancing algorithm from the second codebase
  if (autoBalance) {
    rebalanceLayerPositions(positions, childrenMap, parentsMap, safeCanvasSize / 2, layerMap)
  }
  
  // PHASE 1: Bottom-up preliminary placement (post-order traversal)
  const visited = new Set<string>()
  
  function postOrderTraverse(nodeId: string) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    
    const children = childrenMap.get(nodeId) ?? []
    // Process all children first
    children.forEach(childId => postOrderTraverse(childId))
    
    // Now process this node
    const nodePos = positions.get(nodeId)!
    const childrenList = children.map(id => positions.get(id)!)

    if (childrenList.length > 0) {
      // Adjust spacing based on branch type
      // Side branches get more spacing to separate them visually
      const baseSpacing = CHILD_VERTICAL_SPACING
      const sideBranchSpacing = baseSpacing * 1.3 // 30% more spacing for side branches
      
      const parentY = nodePos.y
      const childCount = childrenList.length
      const midpoint = (childCount - 1) / 2
      
      childrenList.forEach((childPos, i) => {
        const spacing = childPos.branchType === 'side' ? sideBranchSpacing : baseSpacing
        const offset = (i - midpoint) * spacing
        childPos.y = parentY + offset
      })
      
      // Calculate subtree bounding box
      let minY = Math.min(...childrenList.map(c => c.y))
      let maxY = Math.max(...childrenList.map(c => c.y))
      
      // Include this node's Y in the bounding box
      minY = Math.min(minY, nodePos.y)
      maxY = Math.max(maxY, nodePos.y)
      
      // Also include all descendants' bounding boxes
      childrenList.forEach(childPos => {
        if (childPos.minY !== undefined && childPos.maxY !== undefined) {
          minY = Math.min(minY, childPos.minY)
          maxY = Math.max(maxY, childPos.maxY)
        }
      })
      
      nodePos.minY = minY
      nodePos.maxY = maxY
    } else {
      // Leaf node: bounding box is just the node itself
      nodePos.minY = nodePos.y
      nodePos.maxY = nodePos.y
    }
  }
  
  // Start post-order traversal from root (start node)
  postOrderTraverse(startNode.id)
  
  // Handle goal node separately if it exists
  if (goalNode && !visited.has(goalNode.id)) {
    const goalPos = positions.get(goalNode.id)!
    goalPos.minY = goalPos.y
    goalPos.maxY = goalPos.y
  }
  
  // PHASE 2: Top-down collision resolution (pre-order traversal)
  visited.clear()
  
  // Helper function to shift a subtree (node and all descendants) by a given amount
  function shiftSubtree(nodeId: string, shift: number) {
    const nodePos = positions.get(nodeId)!
    nodePos.y += shift
    
    // Update bounding box
    if (nodePos.minY !== undefined) nodePos.minY += shift
    if (nodePos.maxY !== undefined) nodePos.maxY += shift
    
    // Shift all descendants
    const children = childrenMap.get(nodeId) ?? []
    children.forEach(childId => shiftSubtree(childId, shift))
  }
  
  // Helper function to recalculate bounding box for a subtree
  function recalculateBoundingBox(nodeId: string) {
    const nodePos = positions.get(nodeId)!
    const children = childrenMap.get(nodeId) ?? []
    
    if (children.length === 0) {
      nodePos.minY = nodePos.y
      nodePos.maxY = nodePos.y
      return
    }
    
    // Recalculate for all children first
    children.forEach(childId => recalculateBoundingBox(childId))
    
    // Then calculate this node's bounding box
    let minY = nodePos.y
    let maxY = nodePos.y
    
    children.forEach(childId => {
      const childPos = positions.get(childId)!
      if (childPos.minY !== undefined) minY = Math.min(minY, childPos.minY)
      if (childPos.maxY !== undefined) maxY = Math.max(maxY, childPos.maxY)
    })
    
    nodePos.minY = minY
    nodePos.maxY = maxY
  }
  
  function preOrderTraverse(nodeId: string) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    
    const nodePos = positions.get(nodeId)!
    const children = childrenMap.get(nodeId) ?? []
    
    if (children.length > 0) {
      // Sort children by their preliminary Y positions (stable sort with node ID tiebreaker)
      const sortedChildren = [...children].sort((a, b) => {
        const posA = positions.get(a)!
        const posB = positions.get(b)!
        const yDiff = posA.y - posB.y
        if (Math.abs(yDiff) > 0.01) return yDiff
        // Stable tiebreaker: use node ID for determinism
        return a.localeCompare(b)
      })
      
      // Process siblings in order, resolving collisions
      let currentMaxY: number | null = null
      
      sortedChildren.forEach((childId) => {
        const childPos = positions.get(childId)!
        
        if (currentMaxY !== null && childPos.minY !== undefined) {
          // Check if this subtree overlaps or is too close to the previous sibling's subtree
          // Side branches get more spacing
          const minGap = childPos.branchType === 'side' ? MIN_SUBTREE_GAP * 1.2 : MIN_SUBTREE_GAP
          const gap = childPos.minY - currentMaxY
          if (gap < minGap) {
            // Shift this subtree downward
            const shift = minGap - gap
            shiftSubtree(childId, shift)
            // Recalculate bounding box after shift
            recalculateBoundingBox(childId)
            const shiftedPos = positions.get(childId)!
            if (shiftedPos.maxY !== undefined) {
              currentMaxY = shiftedPos.maxY
            }
          } else {
            // Update currentMaxY to the rightmost contour of this subtree
            if (childPos.maxY !== undefined) {
              currentMaxY = Math.max(currentMaxY, childPos.maxY)
            }
          }
        } else {
          // First sibling or no previous sibling - just track maxY
          if (childPos.maxY !== undefined) {
            currentMaxY = childPos.maxY
          }
        }
      })
    }
    
    // Recursively process all children's subtrees
    children.forEach(childId => preOrderTraverse(childId))
  }
  
  // Start pre-order traversal from root
  preOrderTraverse(startNode.id)
  
  // PHASE 2b: Layer-based collision check (check ALL nodes in each layer, not just siblings)
  // This catches collisions between nodes from different branches
  const nodesByLayer = new Map<number, string[]>()
  positions.forEach((pos, nodeId) => {
    const layer = pos.layer
    if (!nodesByLayer.has(layer)) {
      nodesByLayer.set(layer, [])
    }
    nodesByLayer.get(layer)!.push(nodeId)
  })
  
  // Process each layer
  for (const [layer, nodeIds] of nodesByLayer.entries()) {
    if (nodeIds.length <= 1) continue
    
    // Sort all nodes in this layer by Y position (stable sort with node ID tiebreaker)
    const sortedNodes = [...nodeIds].sort((a, b) => {
      const posA = positions.get(a)!
      const posB = positions.get(b)!
      const yDiff = posA.y - posB.y
      if (Math.abs(yDiff) > 0.01) return yDiff
      // Stable tiebreaker: use node ID for determinism
      return a.localeCompare(b)
    })
    
    // Check adjacent nodes and resolve collisions
    for (let i = 0; i < sortedNodes.length - 1; i++) {
      const nodeAId = sortedNodes[i]
      const nodeBId = sortedNodes[i + 1]
      
      const posA = positions.get(nodeAId)!
      const posB = positions.get(nodeBId)!
      
      // Check if nodes are too close (using node Y positions directly)
      // Side branches get more spacing
      const minDistance = (posA.branchType === 'side' || posB.branchType === 'side') 
        ? MIN_SUBTREE_GAP * 1.2 
        : MIN_SUBTREE_GAP
      const distance = Math.abs(posB.y - posA.y)
      if (distance < minDistance) {
        // Shift node B and its entire subtree downward
        const shift = minDistance - distance
        shiftSubtree(nodeBId, shift)
        // Recalculate bounding boxes after shift
        recalculateBoundingBox(nodeBId)
        // Update position B for next iteration
        const updatedPosB = positions.get(nodeBId)!
        posB.y = updatedPosB.y
        if (updatedPosB.minY !== undefined) posB.minY = updatedPosB.minY
        if (updatedPosB.maxY !== undefined) posB.maxY = updatedPosB.maxY
      }
    }
  }
  
  // PHASE 3: Final centering
  // Calculate average Y of layer 0 + layer 1 nodes
  const layer0Nodes: string[] = []
  const layer1Nodes: string[] = []
  
  positions.forEach((pos, nodeId) => {
    if (pos.layer === 0) layer0Nodes.push(nodeId)
    if (pos.layer === 1) layer1Nodes.push(nodeId)
  })
  
  const allLayer01Nodes = [...layer0Nodes, ...layer1Nodes]
  if (allLayer01Nodes.length > 0) {
    const avgY = allLayer01Nodes.reduce((sum, id) => sum + positions.get(id)!.y, 0) / allLayer01Nodes.length
    const targetY = safeCanvasSize / 2
    const shift = targetY - avgY
    
    // Shift all nodes by this amount
    positions.forEach(pos => {
      pos.y += shift
      if (pos.minY !== undefined) pos.minY += shift
      if (pos.maxY !== undefined) pos.maxY += shift
    })
  }
  
  // Build layout nodes with final positions
  let farthestNodeId: string | undefined
  let farthestLayer = -Infinity
  
  // Calculate the center X position between start and goal to center the graph
  const startLayer = 0
  const goalLayerX = goalLayer * LAYER_HORIZONTAL_SPACING + START_X
  const startLayerX = startLayer * LAYER_HORIZONTAL_SPACING + START_X
  const graphCenterX = goalNode ? (startLayerX + goalLayerX) / 2 : startLayerX
  
  // Calculate offset to center the graph (shift so center is at 0)
  const xOffset = -graphCenterX
  
  const layoutNodes: LayoutNodeMeta[] = nodes.map((node) => {
    let computedLayer = layerMap.get(node.id) ?? 0
    if (node.id === goalNode?.id) {
      computedLayer = goalLayer
    }
    
    // Track farthest non-goal node
    if (!node.isGoal && computedLayer >= 0 && computedLayer >= farthestLayer) {
      farthestNodeId = node.id
      farthestLayer = computedLayer
    }
    
    const nodePos = positions.get(node.id)!
    
    // Horizontal positioning: targetX = LAYER_HORIZONTAL_SPACING * layer + START_X
    // Then shift by xOffset to center the graph around 0
    const targetX = (LAYER_HORIZONTAL_SPACING * computedLayer + START_X) + xOffset
    const targetY = nodePos.y - safeCanvasSize / 2 // Relative to center
    
    let finalTargetX: number
    let finalTargetY: number

    if (orientation === 'horizontal') {
      finalTargetX = targetX
      finalTargetY = targetY
    } else {
      // Vertical orientation: swap axes
      finalTargetX = targetY
      finalTargetY = targetX
    }
    
    const layoutNode: LayoutNodeMeta = {
      ...node,
      layer: computedLayer,
      computedLayer,
      targetX: finalTargetX,
      targetY: finalTargetY,
      absoluteY: nodePos.y,
      parentId: nodePos.parentId,
      branchType: nodePos.branchType || 'forward', // Default to forward if not set
    }

    return layoutNode
  })

  // Update animation targets
  animationManager.updateTargets(
    layoutNodes.map((node) => ({
      id: node.id,
      targetX: node.targetX,
      targetY: node.targetY,
      parentId: node.parentId,
    }))
  )

  const nodeMeta = new Map(layoutNodes.map((node) => [node.id, node]))

  // Calculate bounding box of all nodes (accounting for node sizes)
  // Start/goal nodes: 48px base size, regular nodes: 36px base size
  // Add buffer for stroke and visual radius
  const START_GOAL_NODE_RADIUS = 50
  const REGULAR_NODE_RADIUS = 40
  
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  if (layoutNodes.length > 0) {
    layoutNodes.forEach((node) => {
      const nodeRadius = node.isStart || node.isGoal ? START_GOAL_NODE_RADIUS : REGULAR_NODE_RADIUS
      minX = Math.min(minX, node.targetX - nodeRadius)
      maxX = Math.max(maxX, node.targetX + nodeRadius)
      minY = Math.min(minY, node.targetY - nodeRadius)
      maxY = Math.max(maxY, node.targetY + nodeRadius)
    })
  } else {
    // Empty graph - use default bounds
    minX = -100
    maxX = 100
    minY = -100
    maxY = 100
  }

  const width = maxX - minX
  const height = maxY - minY
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return {
    nodes: layoutNodes,
    nodeMeta,
    maxLayer,
    goalLayer,
    startNodeId: startNode.id,
    goalNodeId: goalNode?.id,
    farthestNodeId,
    boundingBox: {
      minX: isFinite(minX) ? minX : -100,
      maxX: isFinite(maxX) ? maxX : 100,
      minY: isFinite(minY) ? minY : -100,
      maxY: isFinite(maxY) ? maxY : 100,
      centerX: isFinite(centerX) ? centerX : 0,
      centerY: isFinite(centerY) ? centerY : 0,
      width: Math.max(width, 0), // Ensure non-negative
      height: Math.max(height, 0), // Ensure non-negative
    },
  }
}

/**
 * Reset animation state (useful when graph is completely reset)
 */
export function resetLayoutAnimation(): void {
  animationManager.reset()
}