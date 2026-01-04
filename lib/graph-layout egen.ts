import type { GraphEdge, GraphNode } from '@/types'

const BASE_CANVAS_SIZE = 640
const MIN_VERTICAL_SCALE = 1
const MAX_VERTICAL_SCALE = 1.8

// Animation constants
const ANIMATION_DURATION = 600 // milliseconds

// Layout constants
const LAYER_HORIZONTAL_SPACING = 320
const CHILD_VERTICAL_SPACING = 110
const MIN_SUBTREE_GAP = 60
const START_X = 140

// Additional constants from second codebase
const BASE_FORWARD_CONFLICT_SPACING = 150

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
function interpolatePosition(
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

  // /**
  //  * Update target positions and start animations if positions changed
  //  * Returns map of current positions (immediate if no animation, start pos if animating)
  //  */
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
  let bestLayer = Infinity

  for (const parentId of parents) {
    if (parentId === goalNodeId && parents.length > 1) continue
    const parentLayer = layerMap.get(parentId) ?? Infinity
    if (parentLayer < bestLayer) {
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
 * Deterministic 3-phase tree layout with collision-free guarantees and proper side branching
 */

// This is graphlaoyresult interface:
/*
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
*/
function findPathLenghts(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const adjacency = new Map<string, string[]>()
  edges.forEach((edge) => {
    const sourceId = resolveNodeId(edge.source)
    const targetId = resolveNodeId(edge.target)
    if (!adjacency.has(sourceId)) adjacency.set(sourceId, [])
    adjacency.get(sourceId)!.push(targetId)
  })
  const pathLengths = new Map<string, number>()
  const dfs = (nodeId: string, length: number) => {
    if (pathLengths.has(nodeId) && pathLengths.get(nodeId)! >= length) {
      return
    }
    pathLengths.set(nodeId, length)
    const neighbors = adjacency.get(nodeId) || []
    for (const neighborId of neighbors) {
      dfs(neighborId, length + 1)
    }
  }
  nodes.forEach(node => {
    dfs(node.id, 0)
  })
  return pathLengths
}
function getNodeFromId(nodes: GraphNode[], id: string): GraphNode | undefined {
  return nodes.find(node => node.id === id)
}
// TODO: adjust positon and spacing based on the numner of layers so graph stays in view
// TODO: må oppdatera layout array med ny node
// TODO: add integrate with animationmananger

export function computeGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  canvasCrossAxisSize: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
  spacingMultiplier: number = 100,
  autoBalance: boolean = true,
  existingPositions?: Map<string, { x: number; y: number }>
): GraphLayoutResult {
  // Nodes have layer but are missing the y and x positions
  console.log('start', nodes, edges)
  const startNode = nodes.find((node) => node.isStart)
  const goalNode = nodes.find((node) => node.isGoal)


  const nodesByLayer = nodes.reduce(
    (map, node) => map.set(node.layer, [...(map.get(node.layer) || []), node]),
    new Map()
  );

  nodesByLayer.delete(-1) // Hacky soulution to remove duplicated goal node on wrong index
  const maxLayer = Math.max(...(nodesByLayer.keys()))
  const goalLayer = maxLayer + 1
  if (goalNode) { nodesByLayer.set(goalLayer, [goalNode]) }

  const parentIdMap: Map<string, string | undefined> = new Map();
  nodesByLayer.forEach((layerNodes, layer) => {
    layerNodes.forEach((node: GraphNode) => {
      const parentId = nodesByLayer.get(layer - 1)?.find((n: GraphNode) => n.parts[1] === node.parts[0])?.id
      parentIdMap.set(node.id, parentId)
      console.log('setting parentId for node', node.id, 'to', parentId);
    });
  });


  // sort nodes by length of parts within each layer
  const pathlengths = findPathLenghts(nodes, edges)
  nodesByLayer.forEach((layerNodes, layer) => {
    layerNodes.sort((a: GraphNode, b: GraphNode) => (pathlengths.get(a.id) || 0) - (pathlengths.get(b.id) || 0))
    layerNodes.sort((a: GraphNode, b: GraphNode) => {
      const pathLengthA: number = pathlengths.get(a.id) || 0;
      const pathLengthB: number = pathlengths.get(b.id) || 0;
      return pathLengthA - pathLengthB;
    });
  });
  // Sort and put biggest values in the midde
  nodesByLayer.forEach((layerNodes, layer) => {
    layerNodes.sort((a: GraphNode, b: GraphNode) => {
      const valA: number = pathlengths.get(a.id) || 0;
      const valB: number = pathlengths.get(b.id) || 0;

      // Sort by distance from middle (largest values should be near center)
      const length: number = layerNodes.length;
      // This creates a "valley" shape where largest are in middle
      return Math.abs(valA - length / 2) - Math.abs(valB - length / 2);
    });
  });
  nodesByLayer.forEach((layernodes, layer) => {
    // Sort so that nodes with the same parts[0] are adjacent
    function getParent(part: string): GraphNode | undefined {
      return nodesByLayer.get(layer - 1)?.find((n: GraphNode) => n.parts[1] === part)
    }
    layernodes.sort((a: GraphNode, b: GraphNode): number => {
      const parentA: GraphNode | undefined = getParent(a.parts[0] || '')
      const parentB: GraphNode | undefined = getParent(b.parts[0] || '')
      const partA: string | undefined = parentA?.parts[1]
      const partB: string | undefined = parentB?.parts[1]
      console.log('parentid partA, partB:', a.parentId, parentA, parentB)
      // Group by the same part value
      if (partA === partB) {
        return 0 // Keep relative order when same
      }

      // Otherwise sort alphabetically to group similar values
      return (partA ?? '').localeCompare(partB ?? '')
    })
    console.log('sorted layer ${layer}:', layernodes);
  });
  console.log('After sorting by path lengths:', nodesByLayer);

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  const nodeMeta: Map<string, LayoutNodeMeta> = new Map()
  const layoutNodes: LayoutNodeMeta[] = []
  nodesByLayer.forEach((layerNodes, layer) => {
    const layerSize = layerNodes.length
    // layerNodes.sort((a: GraphNode, b: GraphNode) => a.parts[0].localeCompare(b.parts[0])) // Stable sort for consistent layout
    layerNodes.forEach((node: GraphNode, index: number) => {
      const layerHeight = layerSize * LAYER_HORIZONTAL_SPACING
      let targetX = START_X + layer * LAYER_HORIZONTAL_SPACING
      // Resolve parent from existing node data or the derived parentIdMap so children start from the real parent position
      const effectiveParentId = node.parentId ?? parentIdMap.get(node.id)
      const parentY = nodeMeta.get(effectiveParentId || '')?.absoluteY || (canvasCrossAxisSize / 2)
      console.log('parentY for node', node.word, 'is', parentY, 'and the parent word is', nodesByLayer.get(layer - 1)?.find((n: GraphNode) => n.parts[1] === node.parts[0])?.word)
      const siblings = layerNodes.filter((n: GraphNode) => (n.parentId ?? parentIdMap.get(n.id)) === effectiveParentId)
      // Evenly space this layer around canvas center instead of stacking from parent
      const midNode = (layerSize - 1) / 2
      let targetY = (canvasCrossAxisSize / 2) + (index - midNode) * CHILD_VERTICAL_SPACING
      //let targetY = (canvasCrossAxisSize / (layerSize + 1)) * (index + 1)

      // Swap directions for mobile layout
      orientation === 'vertical' ? [targetX, targetY] = [targetY, targetX] : null
      // TODO: adjust min and max correctly
      minX = Math.min(minX, targetX)
      maxX = Math.max(maxX, targetX)
      minY = Math.min(minY, targetY)
      maxY = Math.max(maxY, targetY)
      const layoutNode: LayoutNodeMeta = {
        ...node,
        targetX,
        targetY,
        absoluteY: targetY,
        parentId: effectiveParentId,
        computedLayer: layer,
        branchType: 'forward',
      }
      layoutNodes.push(layoutNode)
      nodeMeta.set(node.id, layoutNode)
    })
  })
  console.log('nodesbylayer', nodesByLayer)
  console.log('pathlengths', pathlengths)
  const width = maxX - minX
  const height = maxY - minY
  let centerX = (minX + maxX) / 2
  let centerY = (minY + maxY) / 2

  // Recenter coordinates so the graph is around the origin to avoid off-screen starts
  const offsetX = isFinite(centerX) ? -centerX : 0
  const offsetY = isFinite(centerY) ? -centerY : 0
  if (offsetX !== 0 || offsetY !== 0) {
    layoutNodes.forEach((node) => {
      const updated = nodeMeta.get(node.id)
      node.targetX += offsetX
      node.targetY += offsetY
      node.absoluteY += offsetY
      if (updated) {
        updated.targetX = node.targetX
        updated.targetY = node.targetY
        updated.absoluteY = node.absoluteY
      }
    })

    minX += offsetX
    maxX += offsetX
    minY += offsetY
    maxY += offsetY
    centerX += offsetX
    centerY += offsetY
  }

  // Mobile/vertical: additionally anchor the start node to the origin to keep it in view
  if (orientation === 'vertical' && startNode) {
    const startMeta = nodeMeta.get(startNode.id)
    if (startMeta) {
      const startOffsetX = -startMeta.targetX
      const startOffsetY = -startMeta.targetY

      if (startOffsetX !== 0 || startOffsetY !== 0) {
        layoutNodes.forEach((node) => {
          const updated = nodeMeta.get(node.id)
          node.targetX += startOffsetX
          node.targetY += startOffsetY
          node.absoluteY += startOffsetY
          if (updated) {
            updated.targetX = node.targetX
            updated.targetY = node.targetY
            updated.absoluteY = node.absoluteY
          }
        })

        minX += startOffsetX
        maxX += startOffsetX
        minY += startOffsetY
        maxY += startOffsetY
        centerX += startOffsetX
        centerY += startOffsetY
      }
    }
  }
  //console.log('layers', layers)
  animationManager.updateTargets(
    layoutNodes.map((node) => ({
      id: node.id,
      targetX: node.targetX,
      targetY: node.targetY,
      parentId: node.parentId,
    }))
  )
  const GraphLayoutResult: GraphLayoutResult = {
    nodes: layoutNodes,
    nodeMeta,
    maxLayer,
    goalLayer,
    // Make so it cant be undefined
    startNodeId: startNode?.id,
    goalNodeId: goalNode?.id,
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
  console.log('Final layout result:', GraphLayoutResult)
  return {
    ...GraphLayoutResult,
  }
}
/**
 * Reset animation state (useful when graph is completely reset)
 */
export function resetLayoutAnimation(): void {
  animationManager.reset()
}
