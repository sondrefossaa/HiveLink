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
}

export interface LayoutNodeMeta extends GraphNode {
  targetX: number
  targetY: number
  absoluteY: number
  parentId?: string
  computedLayer: number
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

function buildLayerMap(
  startNodeId: string,
  adjacency: Map<string, string[]>,
  nodeMap: Map<string, GraphNode>,
  goalNodeId?: string
): Map<string, number> {
  const layerMap = new Map<string, number>()
  const queue: string[] = []

  layerMap.set(startNodeId, 0)
  queue.push(startNodeId)

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const currentLayer = layerMap.get(currentId) ?? 0
    const children = adjacency.get(currentId) ?? []

    for (const childId of children) {
      if (childId === goalNodeId) continue
      
      // Each connection increments layer by 1 (simple tree layout)
      const nextLayer = currentLayer + 1
      
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

  // In suffix chaining, every node has exactly one parent (the immediate predecessor)
  // Choose the parent with the highest layer (most recent in the chain)
  let chosen: string | undefined
  let bestLayer = -Infinity

  for (const parentId of parents) {
    if (parentId === goalNodeId && parents.length > 1) continue
    const parentLayer = layerMap.get(parentId) ?? -Infinity
    if (parentLayer > bestLayer) {
      bestLayer = parentLayer
      chosen = parentId
    }
  }

  return chosen ?? parents[0]
}


/**
 * MAIN LAYOUT FUNCTION - Graph Layout System v3
 * Deterministic 3-phase tree layout with collision-free guarantees
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
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  
  // Build adjacency and incoming maps
  const adjacency = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  
  edges.forEach((edge) => {
    const sourceId = resolveNodeId(edge.source)
    const targetId = resolveNodeId(edge.target)
    
    if (!adjacency.has(sourceId)) adjacency.set(sourceId, [])
    adjacency.get(sourceId)!.push(targetId)
    
    if (!incoming.has(targetId)) incoming.set(targetId, [])
    incoming.get(targetId)!.push(sourceId)
  })
  
  // Calculate layers for all nodes
  const layerMap = buildLayerMap(startNode.id, adjacency, nodeMap, goalNode?.id)

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
  
  // Build parent-child tree structure (suffix-chaining: one parent per node)
  const parentMap = new Map<string, string | undefined>()
  const childrenMap = new Map<string, string[]>()
  
  // Initialize children map
  nodes.forEach((node) => {
    if (!node.isStart && node.id !== goalNode?.id) {
      const parentId = selectPrimaryParent(node.id, incoming, layerMap, goalNode?.id)
      parentMap.set(node.id, parentId)
      
      if (parentId) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, [])
        }
        childrenMap.get(parentId)!.push(node.id)
      }
    }
  })
  
  // Initialize positions map
  const positions = new Map<string, NodePosition>()
  
  // Initialize all nodes with their layer
  nodes.forEach((node) => {
    let layer = layerMap.get(node.id) ?? 0
    if (node.id === goalNode?.id) {
      layer = goalLayer
    }
    
    positions.set(node.id, {
      y: safeCanvasSize / 2, // Start at center, will be adjusted
      layer,
      parentId: parentMap.get(node.id),
    })
  })
  
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
      // Place children symmetrically around parent's Y
      const parentY = nodePos.y
      const childCount = childrenList.length
      const midpoint = (childCount - 1) / 2
      
      childrenList.forEach((childPos, i) => {
        const offset = (i - midpoint) * CHILD_VERTICAL_SPACING
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
          const gap = childPos.minY - currentMaxY
          if (gap < MIN_SUBTREE_GAP) {
            // Shift this subtree downward
            const shift = MIN_SUBTREE_GAP - gap
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
      const distance = Math.abs(posB.y - posA.y)
      if (distance < MIN_SUBTREE_GAP) {
        // Shift node B and its entire subtree downward
        const shift = MIN_SUBTREE_GAP - distance
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