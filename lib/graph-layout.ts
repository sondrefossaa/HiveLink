import type { GraphEdge, GraphNode } from '@/types'

/**
 * Graph layout system v4
 *
 * Design decisions (see plan):
 * - Pure function: computeGraphLayout has no side effects. The animation
 *   manager is driven by the graph component.
 * - Stable world coordinates: the start node is anchored at the origin and
 *   the graph grows outward (+X per layer, or +Y when vertical). Nothing is
 *   re-centered when a new layer is added - the camera handles framing.
 * - Tree-style placement: each word hangs under its anchor parent, siblings
 *   spread around the parent's cross-axis position, per-layer collision
 *   resolution keeps nodes from overlapping.
 * - Parent matching follows the actual game rule: a child's FIRST part must
 *   equal its parent's LAST part (words may have 3+ parts).
 * - Best-fit anchor: when a word connects to multiple existing words, the
 *   anchor parent is the candidate closest to the mean position of all
 *   candidates (minimizes total edge length), tie-broken by lowest layer.
 */

// Layout constants
export const LAYER_HORIZONTAL_SPACING = 320
export const CHILD_VERTICAL_SPACING = 110
// Minimum center-to-center gap between the outermost nodes of adjacent parent
// groups. Must exceed the node diameter (~75 incl. stroke) plus the label
// drawn under each node (~25), so the full vertical spacing is used - this
// keeps gaps uniform across a layer and guarantees no overlap.
export const MIN_SUBTREE_GAP = CHILD_VERTICAL_SPACING

// Threshold for determining if two nodes are on the same layer
const SAME_LAYER_THRESHOLD = 50

// Node radii used for bounding box padding (matches renderer sizes + stroke)
const START_GOAL_NODE_RADIUS = 50
const REGULAR_NODE_RADIUS = 40

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

interface PlacementBlock {
  anchorId: string
  group: GraphNode[]
  blockMin: number
  blockMax: number
  desiredMin: number
}

interface AnimationState {
  startPos: Position
  endPos: Position
  startTime: number
}

const EMPTY_POSITIONS: ReadonlyMap<string, Position> = new Map()

/**
 * Animation manager for smooth node position transitions.
 * Singleton - lives in graph-layout to keep animation logic centralized.
 */
class LayoutAnimationManager {
  private previousPositions = new Map<string, Position>()
  private activeAnimations = new Map<string, AnimationState>()
  private prefersReducedMotion = false

  constructor() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      this.prefersReducedMotion = mediaQuery.matches
      const handleChange = (e: MediaQueryListEvent) => {
        this.prefersReducedMotion = e.matches
      }
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange)
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleChange)
      }
    }
  }

  isReducedMotion(): boolean {
    return this.prefersReducedMotion
  }

  /**
   * Update target positions and start animations if positions changed.
   * Returns map of current positions (only for actively animating nodes).
   */
  updateTargets(
    nodes: Array<{ id: string; targetX: number; targetY: number; parentId?: string }>
  ): ReadonlyMap<string, Position> {
    const currentTime = performance.now()

    // Target positions for parent lookups
    const targetPositionsMap = new Map<string, Position>()
    nodes.forEach((node) => {
      targetPositionsMap.set(node.id, { x: node.targetX, y: node.targetY })
    })

    // All known current positions (previous + actively animating) for parent lookups
    const allCurrentPositions = new Map<string, Position>()
    this.previousPositions.forEach((pos, id) => {
      allCurrentPositions.set(id, pos)
    })
    const animatingPositions = this.getCurrentPositions(currentTime)
    animatingPositions.forEach((pos, id) => {
      allCurrentPositions.set(id, pos)
    })

    nodes.forEach((node) => {
      const prevPos = this.previousPositions.get(node.id)
      const targetPos: Position = { x: node.targetX, y: node.targetY }

      if (this.prefersReducedMotion) {
        this.previousPositions.set(node.id, targetPos)
        this.activeAnimations.delete(node.id)
      } else if (!prevPos) {
        // New node - grow out of its parent's current position if available
        let startPos: Position = targetPos

        if (node.parentId) {
          const parentPos =
            allCurrentPositions.get(node.parentId) ?? targetPositionsMap.get(node.parentId)
          if (parentPos) {
            startPos = parentPos
          }
        }

        const distance = Math.hypot(targetPos.x - startPos.x, targetPos.y - startPos.y)

        if (distance > 1) {
          this.activeAnimations.set(node.id, {
            startPos,
            endPos: targetPos,
            startTime: currentTime,
          })
        } else {
          this.previousPositions.set(node.id, targetPos)
        }
      } else {
        const distance = Math.hypot(targetPos.x - prevPos.x, targetPos.y - prevPos.y)

        if (distance < 1) {
          // Position hasn't changed significantly - keep as-is
        } else {
          this.activeAnimations.set(node.id, {
            startPos: prevPos,
            endPos: targetPos,
            startTime: currentTime,
          })
        }
      }
    })

    return animatingPositions
  }

  /**
   * Get current interpolated positions for all active animations at given time.
   * Completed animations are committed and removed.
   */
  getCurrentPositions(currentTime: number = performance.now()): ReadonlyMap<string, Position> {
    if (this.activeAnimations.size === 0) {
      return EMPTY_POSITIONS
    }

    const currentPositions = new Map<string, Position>()

    this.activeAnimations.forEach((animation, nodeId) => {
      const elapsed = currentTime - animation.startTime
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1)

      if (progress >= 1) {
        currentPositions.set(nodeId, animation.endPos)
        this.previousPositions.set(nodeId, animation.endPos)
        this.activeAnimations.delete(nodeId)
      } else {
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

  hasActiveAnimations(): boolean {
    return this.activeAnimations.size > 0
  }

  /**
   * Immediately place a node at a position (used after drag snap-back).
   */
  finalizePosition(nodeId: string, pos: Position): void {
    this.activeAnimations.delete(nodeId)
    this.previousPositions.set(nodeId, pos)
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
 * Get the animation manager instance (for use by the graph component)
 */
export function getAnimationManager(): LayoutAnimationManager {
  return animationManager
}

/**
 * Reset animation state (useful when graph is completely reset)
 */
export function resetLayoutAnimation(): void {
  animationManager.reset()
}

export interface LayoutNodeMeta extends GraphNode {
  targetX: number
  targetY: number
  /** Cross-axis position before orientation swap (kept for compatibility) */
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

/**
 * Resolve an edge endpoint to its node id (edges may carry string or node refs)
 */
export const resolveEdgeEndpoint = (endpoint: string | GraphNode): string => resolveNodeId(endpoint)

/**
 * Build a tree-style layout.
 *
 * Layers and parentId come from the occurrence tree. The unattached target
 * goal stays one layer beyond the deepest word until the first path reaches it.
 */
export function computeGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): GraphLayoutResult {
  const startNode = nodes.find((node) => node.isStart)
  const goalNodes = nodes.filter((node) => node.isGoal)
  const goalNode = goalNodes.find((node) => node.id === 'goal') ?? goalNodes[0]
  if (!startNode) {
    // Defensive: no start node (should not happen) - empty layout
    return {
      nodes: [],
      nodeMeta: new Map(),
      maxLayer: 0,
      goalLayer: 1,
      boundingBox: {
        minX: -100,
        maxX: 100,
        minY: -100,
        maxY: 100,
        centerX: 0,
        centerY: 0,
        width: 200,
        height: 200,
      },
    }
  }

  // Incoming adjacency (parents by edges)
  const incoming = new Map<string, string[]>()
  edges.forEach((edge) => {
    const sourceId = resolveNodeId(edge.source)
    const targetId = resolveNodeId(edge.target)
    if (!incoming.has(targetId)) incoming.set(targetId, [])
    incoming.get(targetId)!.push(sourceId)
  })

  // Layer assignment: placed occurrences are authoritative. Only the initial,
  // unattached goal preview floats beyond the deepest placed word.
  const layerOf = new Map<string, number>()
  let maxLayer = 0
  nodes.forEach((node) => {
    if (node.isGoal && !node.parentId) return
    const layer = node.layer >= 0 ? node.layer : 0
    layerOf.set(node.id, layer)
    if (layer > maxLayer) maxLayer = layer
  })
  goalNodes.filter((node) => !node.parentId).forEach((node) => {
    layerOf.set(node.id, maxLayer + 1)
  })
  const goalLayer = goalNodes.reduce(
    (deepest, node) => Math.max(deepest, layerOf.get(node.id) ?? maxLayer + 1),
    maxLayer
  )
  maxLayer = Math.max(maxLayer, goalLayer)

  // Group nodes per layer (deterministic order)
  const layers = new Map<number, GraphNode[]>()
  nodes.forEach((node) => {
    const layer = layerOf.get(node.id)!
    if (!layers.has(layer)) layers.set(layer, [])
    layers.get(layer)!.push(node)
  })

  // Cross-axis positions (pre-swap "y" in horizontal world space)
  const yPos = new Map<string, number>()
  const anchorOf = new Map<string, string>()

  // Anchor the start node at the origin
  yPos.set(startNode.id, 0)
  const layer0Others = (layers.get(0) ?? []).filter((n) => n.id !== startNode.id)
  layer0Others.forEach((node, index) => {
    yPos.set(node.id, (index + 1) * CHILD_VERTICAL_SPACING)
  })

  // Place layers 1..maxLayer tree-style
  for (let layer = 1; layer <= maxLayer; layer++) {
    const layerNodes = layers.get(layer)
    if (!layerNodes || layerNodes.length === 0) continue

    // Anchor selection: best-fit parent (closest to mean of all candidates)
    const assignments: Array<{ node: GraphNode; anchorId: string; anchorY: number }> = []
    layerNodes.forEach((node) => {
      const explicitParent = node.parentId && yPos.has(node.parentId) ? node.parentId : undefined
      const candidates = explicitParent
        ? [explicitParent]
        : (incoming.get(node.id) ?? []).filter((pid) => yPos.has(pid))

      let anchorId = ''
      let anchorY = 0

      if (candidates.length > 0) {
        const meanY =
          candidates.reduce((sum, id) => sum + yPos.get(id)!, 0) / candidates.length

        let best = candidates[0]
        let bestDist = Infinity
        let bestLayer = Infinity
        candidates.forEach((pid) => {
          const y = yPos.get(pid)!
          const dist = Math.abs(y - meanY)
          const pLayer = layerOf.get(pid) ?? Infinity
          const better =
            dist < bestDist - 0.5 ||
            (Math.abs(dist - bestDist) <= 0.5 && pLayer < bestLayer) ||
            (Math.abs(dist - bestDist) <= 0.5 && pLayer === bestLayer && pid < best)
          if (better) {
            best = pid
            bestDist = dist
            bestLayer = pLayer
          }
        })

        anchorId = best
        anchorY = yPos.get(best)!
      }

      assignments.push({ node, anchorId, anchorY })
    })

    // Group children by anchor parent
    const groups = new Map<string, GraphNode[]>()
    assignments.forEach(({ node, anchorId }) => {
      if (!groups.has(anchorId)) groups.set(anchorId, [])
      groups.get(anchorId)!.push(node)
    })
    groups.forEach((group) => {
      group.sort((a, b) => a.word.localeCompare(b.word) || a.id.localeCompare(b.id))
    })

    // Forward pass: place groups top-to-bottom, centered on the anchor,
    // pushing down when a group would collide with the one above
    const orderedAnchors = [...groups.keys()].sort((a, b) => {
      const ya = a === '' ? 0 : yPos.get(a)!
      const yb = b === '' ? 0 : yPos.get(b)!
      return ya - yb || a.localeCompare(b)
    })

    const blocks: PlacementBlock[] = []
    let currentMax = -Infinity
    orderedAnchors.forEach((anchorId) => {
      const group = groups.get(anchorId)!
      const anchorY = anchorId === '' ? 0 : yPos.get(anchorId)!
      const mid = (group.length - 1) / 2
      const desiredMin = anchorY - mid * CHILD_VERTICAL_SPACING
      let blockMin = desiredMin
      let blockMax = anchorY + mid * CHILD_VERTICAL_SPACING

      if (currentMax > -Infinity && blockMin < currentMax + MIN_SUBTREE_GAP) {
        const shift = currentMax + MIN_SUBTREE_GAP - blockMin
        blockMin += shift
        blockMax += shift
      }

      blocks.push({ anchorId, group, blockMin, blockMax, desiredMin })
      currentMax = blockMax
    })

    // Backward pass: pull shifted groups back up toward their anchors where
    // free space allows, so layers stay balanced around their parents
    for (let i = blocks.length - 1; i > 0; i--) {
      const block = blocks[i]
      const prevLimit = blocks[i - 1].blockMax + MIN_SUBTREE_GAP
      const target = Math.max(block.desiredMin, prevLimit)
      if (target < block.blockMin) {
        const shift = block.blockMin - target
        block.blockMin -= shift
        block.blockMax -= shift
      }
    }

    blocks.forEach((block) => {
      block.group.forEach((node, index) => {
        yPos.set(node.id, block.blockMin + index * CHILD_VERTICAL_SPACING)
        if (block.anchorId !== '') {
          anchorOf.set(node.id, block.anchorId)
        }
      })
    })
  }

  // Build layout nodes: x = layer * spacing (start at origin), swap for vertical
  const layoutNodes: LayoutNodeMeta[] = []
  const nodeMeta = new Map<string, LayoutNodeMeta>()
  nodes.forEach((node) => {
    const layer = layerOf.get(node.id)!
    const y = yPos.get(node.id) ?? 0
    const x = layer * LAYER_HORIZONTAL_SPACING

    let targetX = x
    let targetY = y
    if (orientation === 'vertical') {
      targetX = y
      targetY = x
    }

    const layoutNode: LayoutNodeMeta = {
      ...node,
      layer,
      computedLayer: layer,
      targetX,
      targetY,
      absoluteY: y,
      parentId: node.parentId ?? anchorOf.get(node.id),
    }
    layoutNodes.push(layoutNode)
    nodeMeta.set(node.id, layoutNode)
  })

  // Bounding box padded with node radii (post-swap coordinates)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  layoutNodes.forEach((node) => {
    const radius = node.isStart || node.isGoal ? START_GOAL_NODE_RADIUS : REGULAR_NODE_RADIUS
    minX = Math.min(minX, node.targetX - radius)
    maxX = Math.max(maxX, node.targetX + radius)
    minY = Math.min(minY, node.targetY - radius)
    maxY = Math.max(maxY, node.targetY + radius)
  })
  if (!isFinite(minX)) {
    minX = -100
    maxX = 100
    minY = -100
    maxY = 100
  }

  const width = Math.max(maxX - minX, 0)
  const height = Math.max(maxY - minY, 0)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return {
    nodes: layoutNodes,
    nodeMeta,
    maxLayer,
    goalLayer,
    startNodeId: startNode.id,
    goalNodeId: goalNode?.id,
    boundingBox: {
      minX,
      maxX,
      minY,
      maxY,
      centerX,
      centerY,
      width,
      height,
    },
  }
}

/**
 * Presentation-level edge filtering (ported from the old graphData memo):
 * - Removes exact and reverse duplicate edges
 * - Removes same-layer edges that span over an intermediate connected node
 */
export function computeVisibleEdges(
  edges: GraphEdge[],
  nodeMeta: Map<string, LayoutNodeMeta>,
  orientation: 'horizontal' | 'vertical'
): GraphEdge[] {
  const mainAxis = (node: LayoutNodeMeta): number =>
    orientation === 'horizontal' ? node.targetX : node.targetY

  const seenEdges = new Set<string>()
  const edgeSet = new Set<string>()
  const sourceToTargets = new Map<string, Set<string>>()
  const targetToSources = new Map<string, Set<string>>()

  edges.forEach((edge) => {
    const sourceId = resolveNodeId(edge.source)
    const targetId = resolveNodeId(edge.target)
    const key = `${sourceId}->${targetId}`
    edgeSet.add(key)

    if (!sourceToTargets.has(sourceId)) sourceToTargets.set(sourceId, new Set())
    if (!targetToSources.has(targetId)) targetToSources.set(targetId, new Set())
    sourceToTargets.get(sourceId)!.add(targetId)
    targetToSources.get(targetId)!.add(sourceId)
  })

  // Pre-build nodes by main-axis position (rounded to nearest SAME_LAYER_THRESHOLD) for same-layer checks
  const nodesByLayerPos = new Map<number, LayoutNodeMeta[]>()
  nodeMeta.forEach((node) => {
    const layerPos = Math.round(mainAxis(node) / SAME_LAYER_THRESHOLD) * SAME_LAYER_THRESHOLD
    if (!nodesByLayerPos.has(layerPos)) {
      nodesByLayerPos.set(layerPos, [])
    }
    nodesByLayerPos.get(layerPos)!.push(node)
  })

  const hasPathThrough = (sourceId: string, targetId: string, intermediateId: string): boolean => {
    const sourceToIntermediate =
      sourceToTargets.get(sourceId)?.has(intermediateId) ||
      targetToSources.get(intermediateId)?.has(sourceId) ||
      edgeSet.has(`${sourceId}->${intermediateId}`) ||
      edgeSet.has(`${intermediateId}->${sourceId}`)
    const intermediateToTarget =
      sourceToTargets.get(intermediateId)?.has(targetId) ||
      targetToSources.get(targetId)?.has(intermediateId) ||
      edgeSet.has(`${intermediateId}->${targetId}`) ||
      edgeSet.has(`${targetId}->${intermediateId}`)
    return Boolean(sourceToIntermediate && intermediateToTarget)
  }

  return edges.filter((edge) => {
    const sourceId = resolveNodeId(edge.source)
    const targetId = resolveNodeId(edge.target)
    const key = `${sourceId}->${targetId}`
    const reverseKey = `${targetId}->${sourceId}`

    if (seenEdges.has(key) || seenEdges.has(reverseKey)) {
      return false
    }

    const sourceNode = nodeMeta.get(sourceId)
    const targetNode = nodeMeta.get(targetId)

    if (!sourceNode || !targetNode) {
      seenEdges.add(key)
      return true
    }

    const sameLayer = Math.abs(mainAxis(sourceNode) - mainAxis(targetNode)) < SAME_LAYER_THRESHOLD

    if (sameLayer) {
      const layerPos = Math.round(mainAxis(sourceNode) / SAME_LAYER_THRESHOLD) * SAME_LAYER_THRESHOLD
      const sameLayerNodes = nodesByLayerPos.get(layerPos) || []

      const crossAxis = (node: LayoutNodeMeta): number =>
        orientation === 'horizontal' ? node.targetY : node.targetX
      const minPos = Math.min(crossAxis(sourceNode), crossAxis(targetNode))
      const maxPos = Math.max(crossAxis(sourceNode), crossAxis(targetNode))

      const hasIntermediateNode = sameLayerNodes.some((node) => {
        if (node.id === sourceId || node.id === targetId) return false
        if (crossAxis(node) <= minPos || crossAxis(node) >= maxPos) return false
        return hasPathThrough(sourceId, targetId, node.id)
      })

      if (hasIntermediateNode) {
        return false
      }
    }

    seenEdges.add(key)
    return true
  })
}
