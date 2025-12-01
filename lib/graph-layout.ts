import type { GraphEdge, GraphNode } from '@/types'

export const FIXED_HORIZONTAL_SPACING = 100 // For backward compatibility with Graph.tsx
const BASE_CANVAS_SIZE = 640
const MIN_VERTICAL_SCALE = 1
const MAX_VERTICAL_SCALE = 1.8

// Animation constants
const ANIMATION_DURATION = 600 // milliseconds

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

interface BranchAssignment {
  crossAxisPos: number
  parentId?: string
  layer: number
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

const clampValue = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

/**
 * Helper function to move a parent node and all its children together
 * This preserves parent-child relationships when resolving collisions
 */
function moveParentAndChildren(
  parentId: string,
  newPos: number,
  branchAssignments: Map<string, BranchAssignment>,
  childrenByParent: Map<string, string[]>,
  canvasSize: number,
  margin: number
): void {
  const parent = branchAssignments.get(parentId)
  if (!parent) return
  
  const offset = newPos - parent.crossAxisPos
  parent.crossAxisPos = clampValue(newPos, margin, canvasSize - margin)
  
  // Move all children by the same offset
  const children = childrenByParent.get(parentId) ?? []
  for (const childId of children) {
    const child = branchAssignments.get(childId)
    if (child) {
      child.crossAxisPos = clampValue(
        child.crossAxisPos + offset,
        margin,
        canvasSize - margin
      )
    }
  }
}

/**
 * Rebalance positions: enforce strict parent-child alignment
 * - Single children MUST stay at parent's exact Y position (straight forward)
 * - Multiple siblings are distributed evenly around parent's center
 * - Collision detection with simple offset resolution
 */
function rebalanceLayerPositions(
  branchAssignments: Map<string, BranchAssignment>,
  canvasSize: number
): void {
  const VERTICAL_SPACING = 60
  const MIN_NODE_SPACING = 50 // Minimum spacing between nodes to prevent collision
  const margin = 40 // Margin from canvas edges
  
  // Build children map: parentId -> array of child node IDs
  const childrenByParent = new Map<string, string[]>()
  for (const [nodeId, assignment] of branchAssignments.entries()) {
    if (assignment.parentId) {
      if (!childrenByParent.has(assignment.parentId)) {
        childrenByParent.set(assignment.parentId, [])
      }
      childrenByParent.get(assignment.parentId)!.push(nodeId)
    }
  }
  
  // Step 1: Initial alignment - Position ALL children at their parent's exact Y position
  for (const [nodeId, assignment] of branchAssignments.entries()) {
    if (assignment.parentId) {
      const parentAssignment = branchAssignments.get(assignment.parentId)
      if (parentAssignment) {
        assignment.crossAxisPos = parentAssignment.crossAxisPos
      }
    }
  }
  
  // Step 2: Distribute siblings evenly around parent's center
  for (const [parentId, childIds] of childrenByParent.entries()) {
    // Skip single children - they stay at parent position
    if (childIds.length <= 1) continue
    
    const parentAssignment = branchAssignments.get(parentId)
    if (!parentAssignment) continue
    
    const parentPos = parentAssignment.crossAxisPos
    const childCount = childIds.length
    const midpoint = (childCount - 1) / 2
    
    // Sort children by current position for stability
    const sortedChildren = [...childIds].sort((a, b) => {
      const posA = branchAssignments.get(a)?.crossAxisPos ?? parentPos
      const posB = branchAssignments.get(b)?.crossAxisPos ?? parentPos
      return posA - posB
    })
    
    // Distribute evenly around parent's position
    sortedChildren.forEach((childId, i) => {
      const childAssignment = branchAssignments.get(childId)
      if (childAssignment) {
        const offset = (i - midpoint) * VERTICAL_SPACING
        const idealPos = parentPos + offset
        childAssignment.crossAxisPos = clampValue(idealPos, margin, canvasSize - margin)
      }
    })
  }
  
  // Step 3: Collision detection and resolution
  // Group nodes by layer
  const nodesByLayer = new Map<number, string[]>()
  for (const [nodeId, assignment] of branchAssignments.entries()) {
    const layer = assignment.layer
    if (!nodesByLayer.has(layer)) {
      nodesByLayer.set(layer, [])
    }
    nodesByLayer.get(layer)!.push(nodeId)
  }
  
  // Resolve collisions iteratively
  let hasCollisions = true
  let iterations = 0
  const maxIterations = 10
  
  while (hasCollisions && iterations < maxIterations) {
    iterations++
    hasCollisions = false
    
    // Check each layer for collisions
    for (const [layer, nodeIds] of nodesByLayer.entries()) {
      if (nodeIds.length <= 1) continue
      
      // Sort nodes by parent position first, then by their own position
      // This ensures nodes maintain the relative order of their parents
      const sortedNodes = [...nodeIds].sort((a, b) => {
        const assignmentA = branchAssignments.get(a)
        const assignmentB = branchAssignments.get(b)
        
        if (!assignmentA || !assignmentB) return 0
        
        // If both have parents, sort by parent position first
        if (assignmentA.parentId && assignmentB.parentId) {
          const parentA = branchAssignments.get(assignmentA.parentId)
          const parentB = branchAssignments.get(assignmentB.parentId)
          
          if (parentA && parentB) {
            const parentDiff = parentA.crossAxisPos - parentB.crossAxisPos
            if (Math.abs(parentDiff) > 0.1) {
              // Parents are in different positions - sort by parent position
              return parentDiff
            }
          }
        }
        
        // Fall back to sorting by node's own position
        const posA = assignmentA.crossAxisPos
        const posB = assignmentB.crossAxisPos
        return posA - posB
      })
      
      // Check all pairs for collisions
      for (let i = 0; i < sortedNodes.length - 1; i++) {
        const nodeAId = sortedNodes[i]
        const nodeBId = sortedNodes[i + 1]
        
        const assignmentA = branchAssignments.get(nodeAId)
        const assignmentB = branchAssignments.get(nodeBId)
        
        if (!assignmentA || !assignmentB) continue
        
        const posA = assignmentA.crossAxisPos
        const posB = assignmentB.crossAxisPos
        const distance = Math.abs(posB - posA)
        
        // Only resolve collisions if nodes are actually too close (real collision)
        // Skip if nodes are far enough apart to avoid unnecessary movements
        if (distance < MIN_NODE_SPACING) {
          hasCollisions = true
          
          // Determine node types
          const isASingleChild = assignmentA.parentId && 
            (childrenByParent.get(assignmentA.parentId)?.length ?? 0) === 1
          const isBSingleChild = assignmentB.parentId && 
            (childrenByParent.get(assignmentB.parentId)?.length ?? 0) === 1
          const parentAId = assignmentA.parentId
          const parentBId = assignmentB.parentId
          
          // Priority 1: Never move single children (straight-forward nodes)
          // Single children MUST stay at their parent's exact position - they are never moved directly
          if (isASingleChild && !isBSingleChild) {
            // A is a single child - it cannot be moved. Move B away from A.
            // Move B directly, not its parent, to avoid unnecessary parent movement
            const newPosB = posA + MIN_NODE_SPACING
            assignmentB.crossAxisPos = clampValue(newPosB, margin, canvasSize - margin)
          } else if (isBSingleChild && !isASingleChild) {
            // B is a single child - it cannot be moved. Move A away from B.
            // Move A directly, not its parent, to avoid unnecessary parent movement
            const newPosA = posB - MIN_NODE_SPACING
            assignmentA.crossAxisPos = clampValue(newPosA, margin, canvasSize - margin)
          } else if (isASingleChild && isBSingleChild) {
            // Both are single children - move one parent
            const center = canvasSize / 2
            const parentA = branchAssignments.get(parentAId!)
            const parentB = branchAssignments.get(parentBId!)
            const parentAPos = parentA?.crossAxisPos ?? center
            const parentBPos = parentB?.crossAxisPos ?? center
            
            // Move the parent further from center
            if (Math.abs(parentAPos - center) >= Math.abs(parentBPos - center)) {
              const newPosA = posB - MIN_NODE_SPACING
              const offset = newPosA - posA
              const newParentPos = parentAPos + offset
              moveParentAndChildren(parentAId!, newParentPos, branchAssignments, childrenByParent, canvasSize, margin)
            } else {
              const newPosB = posA + MIN_NODE_SPACING
              const offset = newPosB - posB
              const newParentPos = parentBPos + offset
              moveParentAndChildren(parentBId!, newParentPos, branchAssignments, childrenByParent, canvasSize, margin)
            }
          } else {
            // Neither is a single child - check parent positions to maintain order
            // If A's parent is above B's parent, B should move down (stay below A)
            let shouldMoveB = false
            let shouldMoveParent = false
            let parentToMove: string | undefined
            
            if (parentAId && parentBId) {
              const parentA = branchAssignments.get(parentAId)
              const parentB = branchAssignments.get(parentBId)
              if (parentA && parentB) {
                // If parents are the same, don't move the parent - just move children
                // But siblings should maintain even distribution, so we'll re-distribute after collision
                if (parentAId === parentBId) {
                  // Siblings colliding - we'll re-distribute them after resolving this collision
                  // For now, move the one further from parent position
                  const parentPos = parentA.crossAxisPos
                  const distA = Math.abs(posA - parentPos)
                  const distB = Math.abs(posB - parentPos)
                  shouldMoveB = distA < distB // Move B if A is closer to parent
                  // Mark that we need to re-distribute siblings
                  // (this will be handled by the sibling re-distribution step after collision)
                } else {
                  // Different parents - we need to move parents to resolve collision
                  // This maintains sibling distribution while resolving collisions
                  if (parentA.crossAxisPos < parentB.crossAxisPos) {
                    shouldMoveB = true
                    shouldMoveParent = true
                    parentToMove = parentBId // Move B's parent down
                  } else if (parentA.crossAxisPos > parentB.crossAxisPos) {
                    shouldMoveB = false
                    shouldMoveParent = true
                    parentToMove = parentAId // Move A's parent up
                  } else {
                    // Parents at same position - determine by distance from center
                    const center = canvasSize / 2
                    const distA = Math.abs(posA - center)
                    const distB = Math.abs(posB - center)
                    if (distA > distB) {
                      shouldMoveB = true
                      shouldMoveParent = true
                      parentToMove = parentBId
                    } else {
                      shouldMoveB = false
                      shouldMoveParent = true
                      parentToMove = parentAId
                    }
                  }
                }
              }
            }
            
            // Move children directly (not parents) to resolve collision
            // Only use distance from center if parent order wasn't determined
            if (!shouldMoveParent) {
              // If shouldMoveB wasn't set by parent order, use distance from center
              if (shouldMoveB === false && parentAId && parentBId && parentAId !== parentBId) {
                // Check if we actually determined shouldMoveB from parent positions
                const parentA = branchAssignments.get(parentAId)
                const parentB = branchAssignments.get(parentBId)
                if (parentA && parentB && parentA.crossAxisPos === parentB.crossAxisPos) {
                  // Parents at same position, use distance from center
                  const center = canvasSize / 2
                  const distA = Math.abs(posA - center)
                  const distB = Math.abs(posB - center)
                  shouldMoveB = distA > distB
                }
                // Otherwise shouldMoveB was already set by parent order logic above
              } else if (!parentAId || !parentBId || parentAId === parentBId) {
                // No parents or siblings - use distance from center
                const center = canvasSize / 2
                const distA = Math.abs(posA - center)
                const distB = Math.abs(posB - center)
                shouldMoveB = distA > distB
              }
              
              if (shouldMoveB) {
                // Move B away (down) - but only B, not its parent
                const newPosB = posA + MIN_NODE_SPACING
                assignmentB.crossAxisPos = clampValue(newPosB, margin, canvasSize - margin)
              } else {
                // Move A away (up) - but only A, not its parent
                const newPosA = posB - MIN_NODE_SPACING
                assignmentA.crossAxisPos = clampValue(newPosA, margin, canvasSize - margin)
              }
            } else if (shouldMoveParent && parentToMove) {
              // Move the parent (and all its children) to resolve collision
              // This maintains sibling distribution while resolving collisions
              // CRITICAL: Ensure ALL children of moved parent stay below/above ALL children of other parent
              const parent = branchAssignments.get(parentToMove)
              if (!parent) continue
              
              // Get all children of both parents to ensure proper separation
              const childrenOfMovedParent = childrenByParent.get(parentToMove) ?? []
              const otherParentId = parentToMove === parentAId ? parentBId : parentAId
              const childrenOfOtherParent = otherParentId ? (childrenByParent.get(otherParentId) ?? []) : []
              
              // Find the extreme positions of each parent's children
              let minMovedChildPos = Infinity
              let maxMovedChildPos = -Infinity
              let minOtherChildPos = Infinity
              let maxOtherChildPos = -Infinity
              
              childrenOfMovedParent.forEach(childId => {
                const child = branchAssignments.get(childId)
                if (child) {
                  minMovedChildPos = Math.min(minMovedChildPos, child.crossAxisPos)
                  maxMovedChildPos = Math.max(maxMovedChildPos, child.crossAxisPos)
                }
              })
              
              childrenOfOtherParent.forEach(childId => {
                const child = branchAssignments.get(childId)
                if (child) {
                  minOtherChildPos = Math.min(minOtherChildPos, child.crossAxisPos)
                  maxOtherChildPos = Math.max(maxOtherChildPos, child.crossAxisPos)
                }
              })
              
              // Determine how much to move based on ensuring complete separation
              let offset = 0
              if (shouldMoveB && parentToMove === parentBId) {
                // Moving B's parent down - ensure ALL of B's children are below ALL of A's children
                // Move so that the topmost child of B is below the bottommost child of A
                const requiredSeparation = maxOtherChildPos + MIN_NODE_SPACING - minMovedChildPos
                if (requiredSeparation > 0) {
                  offset = requiredSeparation
                } else {
                  // Already separated, but individual nodes are colliding - use collision-based offset
                  offset = posA + MIN_NODE_SPACING - posB
                }
              } else if (!shouldMoveB && parentToMove === parentAId) {
                // Moving A's parent up - ensure ALL of A's children are above ALL of B's children
                // Move so that the bottommost child of A is above the topmost child of B
                const requiredSeparation = minOtherChildPos - MIN_NODE_SPACING - maxMovedChildPos
                if (requiredSeparation < 0) {
                  offset = requiredSeparation
                } else {
                  // Already separated, but individual nodes are colliding - use collision-based offset
                  offset = posB - MIN_NODE_SPACING - posA
                }
              } else {
                // Fallback - shouldn't happen but handle gracefully
                continue
              }
              
              // Move parent and all its children by the offset
              const newParentPos = parent.crossAxisPos + offset
              moveParentAndChildren(parentToMove, newParentPos, branchAssignments, childrenByParent, canvasSize, margin)
            }
          }
        }
      }
    }
    
    // After each collision resolution iteration, re-distribute siblings to maintain even spacing
    // This ensures that if children were moved during collision resolution, siblings are still evenly distributed
    for (const [parentId, childIds] of childrenByParent.entries()) {
      // Skip single children - they stay at parent position
      if (childIds.length <= 1) continue
      
      const parentAssignment = branchAssignments.get(parentId)
      if (!parentAssignment) continue
      
      const parentPos = parentAssignment.crossAxisPos
      const childCount = childIds.length
      const midpoint = (childCount - 1) / 2
      
      // Sort children by current position for stability
      const sortedChildren = [...childIds].sort((a, b) => {
        const posA = branchAssignments.get(a)?.crossAxisPos ?? parentPos
        const posB = branchAssignments.get(b)?.crossAxisPos ?? parentPos
        return posA - posB
      })
      
      // Re-distribute evenly around parent's position
      sortedChildren.forEach((childId, i) => {
        const childAssignment = branchAssignments.get(childId)
        if (childAssignment) {
          const offset = (i - midpoint) * VERTICAL_SPACING
          const idealPos = parentPos + offset
          childAssignment.crossAxisPos = clampValue(idealPos, margin, canvasSize - margin)
        }
      })
    }
  }
  
  // Step 4: Final enforcement pass - ensure all single children are at parent's exact position
  // This guarantees the "straight forward" rule is never broken, even after collision resolution
  for (const [nodeId, assignment] of branchAssignments.entries()) {
    if (assignment.parentId) {
      const parentAssignment = branchAssignments.get(assignment.parentId)
      if (parentAssignment) {
        const childCount = childrenByParent.get(assignment.parentId)?.length ?? 0
        // Only enforce for single children - they MUST stay at parent's exact position
        if (childCount === 1) {
          assignment.crossAxisPos = parentAssignment.crossAxisPos
        }
      }
    }
  }
}

/**
 * MAIN LAYOUT FUNCTION - Enforces strict layout rules
 * Optionally accepts existing node positions to preserve for animation
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
  
  // Calculate layers for all nodes - each connection increments layer by 1
  const layerMap = buildLayerMap(startNode.id, adjacency, nodeMap, goalNode?.id)

  nodes.forEach((node) => {
    if (!layerMap.has(node.id)) {
      const fallbackLayer = node.layer >= 0 ? node.layer : 0
      layerMap.set(node.id, fallbackLayer)
    }
  })
  
  // Calculate max layer and goal layer
  // Only exclude the actual goal node (id='goal'), not nodes that connect to it
  const nonGoalLayers = nodes
    .filter((node) => node.id !== 'goal')
    .map((node) => layerMap.get(node.id) ?? 0)
  
  const maxLayer = nonGoalLayers.length > 0 ? Math.max(...nonGoalLayers) : 0
  // Goal is always exactly 1 layer after the furthest node
  const goalLayer = maxLayer + 1
  
  // Calculate dynamic layer spacing based on total layers and user-controlled spacing
  // Scale with power of 0.7 to give larger graphs significantly more spacing
  const totalLayers = goalLayer + 1
  const scaleFactor = Math.pow(totalLayers / 4, 0.7)
  // Reduced base spacing from 85 to 60 to make graphs more compact by default
  const baseSpacing = 60 * scaleFactor
  
  // Apply user spacing multiplier (50-300 range maps to 0.5-3x)
  const dynamicLayerSpacing = Math.round(baseSpacing * (spacingMultiplier / 100))
  
  // Goal node is pinned at max layer, centered in cross axis
  const centerCrossAxis = safeCanvasSize / 2
  
  const branchAssignments = new Map<string, BranchAssignment>()

  // Start node is centered
  branchAssignments.set(startNode.id, {
    crossAxisPos: centerCrossAxis,
    layer: 0,
  })

  const sortedNodes = [...nodes]
    .filter((node) => !node.isStart && node.id !== goalNode?.id)
    .sort((a, b) => {
      const layerA = layerMap.get(a.id) ?? 0
      const layerB = layerMap.get(b.id) ?? 0
      if (layerA !== layerB) return layerA - layerB
      return 0
    })

  // First pass: position all nodes directly forward from their parent
  for (const node of sortedNodes) {
    const nodeLayer = layerMap.get(node.id) ?? 0
    const parentId = selectPrimaryParent(node.id, incoming, layerMap, goalNode?.id)
    const parentAssignment = parentId ? branchAssignments.get(parentId) : undefined

    // Initially position directly forward from parent (same cross-axis position)
    const crossAxisPos = parentAssignment?.crossAxisPos ?? centerCrossAxis

    branchAssignments.set(node.id, {
      crossAxisPos,
      layer: nodeLayer,
      parentId,
    })
  }
  
  // Goal node is pinned at goal layer, centered in cross axis
  if (goalNode) {
    branchAssignments.set(goalNode.id, {
      crossAxisPos: centerCrossAxis,
      layer: goalLayer,
    })
  }
  
  // Rebalance positions: distribute siblings evenly around parent (if enabled)
  if (autoBalance) {
    rebalanceLayerPositions(branchAssignments, safeCanvasSize)
  }
  
  // Build layout nodes
  let farthestNodeId: string | undefined
  let farthestLayer = -Infinity
  
  const layoutNodes: LayoutNodeMeta[] = nodes.map((node) => {
    let computedLayer = layerMap.get(node.id) ?? 0
    
    // Goal node gets special layer
    if (node.id === goalNode?.id) {
      computedLayer = goalLayer
    }
    
    // Track farthest non-goal node
    if (!node.isGoal && computedLayer >= 0 && computedLayer >= farthestLayer) {
      farthestNodeId = node.id
      farthestLayer = computedLayer
    }
    
    const assignment =
      branchAssignments.get(node.id) ??
      ({
        crossAxisPos: centerCrossAxis,
        layer: computedLayer,
      } as BranchAssignment)
    
    const layerPos = computedLayer * dynamicLayerSpacing
    const crossAxisPos = assignment.crossAxisPos
    const relativeCrossAxisPos = crossAxisPos - centerCrossAxis

    let targetX: number
    let targetY: number

    if (orientation === 'horizontal') {
      // Shift all nodes to the left by adding negative offset
      // This makes the graph naturally appear more to the left when centered
      // Use smaller offset (0.25 instead of 0.4) to position graph closer to center on mobile
      targetX = layerPos - (goalLayer * dynamicLayerSpacing * 0.25)
      targetY = relativeCrossAxisPos
    } else {
      targetX = relativeCrossAxisPos
      targetY = layerPos
    }
    
    const layoutNode: LayoutNodeMeta = {
      ...node,
      layer: computedLayer,
      computedLayer,
      targetX,
      targetY,
      absoluteY: crossAxisPos,
      parentId: assignment.parentId,
    }

    return layoutNode
  })

  // Update animation targets - this sets up animations but doesn't return current positions
  // Graph.tsx will call getCurrentPositions() on each frame to get interpolated values
  animationManager.updateTargets(
    layoutNodes.map((node) => ({
      id: node.id,
      targetX: node.targetX,
      targetY: node.targetY,
      parentId: node.parentId,
    }))
  )

  const nodeMeta = new Map(layoutNodes.map((node) => [node.id, node]))

  return {
    nodes: layoutNodes,
    nodeMeta,
    maxLayer,
    goalLayer,
    startNodeId: startNode.id,
    goalNodeId: goalNode?.id,
    farthestNodeId,
  }
}

/**
 * Reset animation state (useful when graph is completely reset)
 */
export function resetLayoutAnimation(): void {
  animationManager.reset()
}
