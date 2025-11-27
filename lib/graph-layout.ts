import type { GraphEdge, GraphNode } from '@/types'

export const FIXED_LAYER_SPACING = 300
export const FIXED_HORIZONTAL_SPACING = FIXED_LAYER_SPACING
const BASE_FORWARD_CONFLICT_SPACING = 150
const BASE_CANVAS_SIZE = 640
const MIN_VERTICAL_SCALE = 1
const MAX_VERTICAL_SCALE = 1.8
const MIN_GOAL_LAYER = 8
const MAX_GOAL_LAYER = 12
const MAX_OFFSET_STEPS = 10
const MIN_LAYER_SPACING = 48

type BranchKind = 'origin' | 'forward' | 'side'

interface BranchAssignment {
  branchId: string
  crossAxisPos: number
  parentId?: string
  kind: BranchKind
  layer: number
}

export interface LayoutNodeMeta extends GraphNode {
  targetX: number
  targetY: number
  absoluteY: number
  branchId: string
  parentId?: string
  branchType: BranchKind
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

const clampGoalLayer = (layer: number): number =>
  Math.max(MIN_GOAL_LAYER, Math.min(layer, MAX_GOAL_LAYER))

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
 * MAIN LAYOUT FUNCTION - Enforces strict layout rules
 */
export function computeGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  canvasCrossAxisSize: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal'
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
  
  // Calculate layers for all nodes (Rule #1)
  const layerMap = buildLayerMap(startNode.id, adjacency, goalNode?.id)

  nodes.forEach((node) => {
    if (!layerMap.has(node.id)) {
      const fallbackLayer = node.layer >= 0 ? node.layer : 0
      layerMap.set(node.id, fallbackLayer)
    }
  })
  
  // Calculate max layer and goal layer
  const nonGoalLayers = nodes
    .filter((node) => !node.isGoal && node.id !== goalNode?.id)
    .map((node) => layerMap.get(node.id) ?? 0)
  
  const maxLayer = nonGoalLayers.length > 0 ? Math.max(...nonGoalLayers) : 0
  const goalLayer = clampGoalLayer(Math.max(maxLayer + 1, MIN_GOAL_LAYER))
  
  // Goal node is pinned at max layer, centered in cross axis
  const centerCrossAxis = safeCanvasSize / 2
  
  const branchAssignments = new Map<string, BranchAssignment>()
  const layerOccupancy = new Map<string, number[]>()
  const globalLayerOccupancy = new Map<number, number[]>()
  const getLayerKey = (layer: number, parentId?: string) => `${layer}:${parentId ?? 'root'}`

  const registerLayerPosition = (layer: number, position: number, parentId?: string) => {
    const clamped = clampValue(position, crossAxisMargin, safeCanvasSize - crossAxisMargin)
    const key = getLayerKey(layer, parentId)
    const entries = layerOccupancy.get(key) ?? []
    entries.push(clamped)
    layerOccupancy.set(key, entries)

    const globalEntries = globalLayerOccupancy.get(layer) ?? []
    globalEntries.push(clamped)
    globalLayerOccupancy.set(layer, globalEntries)
    return clamped
  }

  const selectLayerPosition = (
    layer: number,
    preferredPos: number,
    parentId?: string,
    parentPos?: number
  ): number => {
    const key = getLayerKey(layer, parentId)
    const takenPerEdge = layerOccupancy.get(key) ?? []
    const takenGlobal = globalLayerOccupancy.get(layer) ?? []

    const offsets: number[] = [0]
    for (let step = 1; step <= MAX_OFFSET_STEPS; step++) {
      const delta = step * forwardConflictUnit * 0.35 + MIN_LAYER_SPACING
      offsets.push(delta, -delta)
    }

    let bestCandidate: number | undefined
    let bestScore = -Infinity

    for (const offset of offsets) {
      const candidate = clampValue(preferredPos + offset, crossAxisMargin, safeCanvasSize - crossAxisMargin)
      const minEdgeDistance = takenPerEdge.reduce(
        (acc, value) => Math.min(acc, Math.abs(value - candidate)),
        Number.POSITIVE_INFINITY
      )
      const minGlobalDistance = takenGlobal.reduce(
        (acc, value) => Math.min(acc, Math.abs(value - candidate)),
        Number.POSITIVE_INFINITY
      )

      // Skip outright if candidate would collide with existing node
      if (Number.isFinite(minGlobalDistance) && minGlobalDistance < MIN_LAYER_SPACING * 0.65) {
        continue
      }

      const edgeSpacingScore = Number.isFinite(minEdgeDistance)
        ? Math.min(minEdgeDistance, MIN_LAYER_SPACING) / MIN_LAYER_SPACING
        : 1
      const globalSpacingScore = Number.isFinite(minGlobalDistance)
        ? Math.min(minGlobalDistance, MIN_LAYER_SPACING * 1.2) / (MIN_LAYER_SPACING * 1.2)
        : 1
      const closenessScore = parentPos === undefined
        ? 1
        : Math.max(0, 1 - Math.abs(candidate - parentPos) / (forwardConflictUnit * 4))
      const score = closenessScore * 0.6 + edgeSpacingScore * 0.2 + globalSpacingScore * 0.2

      if (score > bestScore) {
        bestScore = score
        bestCandidate = candidate
      }
    }

    const fallbackCandidate = bestCandidate ?? clampValue(preferredPos, crossAxisMargin, safeCanvasSize - crossAxisMargin)
    return registerLayerPosition(layer, fallbackCandidate, parentId)
  }

  branchAssignments.set(startNode.id, {
    branchId: 'branch-main',
    crossAxisPos: registerLayerPosition(0, centerCrossAxis),
    kind: 'origin',
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

  for (const node of sortedNodes) {
    const nodeLayer = layerMap.get(node.id) ?? 0
    const parentId = selectPrimaryParent(node.id, incoming, layerMap, goalNode?.id)
    const parentAssignment = parentId ? branchAssignments.get(parentId) : undefined
    const baseAssignment = parentAssignment ?? branchAssignments.get(startNode.id)!
    const edgeKey = parentId ? `${parentId}->${node.id}` : undefined
    const connectingEdge = edgeKey ? edgeMap.get(edgeKey) : undefined
    const parentNode = parentId ? nodeMap.get(parentId) : undefined
    const branchKind = determineBranchKind(connectingEdge, parentNode, node)

    const branchId = baseAssignment.branchId
    const branchType: BranchKind = branchKind

    const preferredPos = parentAssignment?.crossAxisPos ?? centerCrossAxis
    const alignmentTarget = parentAssignment?.crossAxisPos
    const crossAxisPos = selectLayerPosition(nodeLayer, preferredPos, parentId, alignmentTarget)

    branchAssignments.set(node.id, {
      branchId,
      crossAxisPos,
      kind: branchType,
      layer: nodeLayer,
      parentId,
    })
  }
  
  // Goal node is pinned at goal layer, centered in cross axis
  if (goalNode) {
    branchAssignments.set(goalNode.id, {
      branchId: 'branch-goal',
      crossAxisPos: registerLayerPosition(goalLayer, centerCrossAxis),
      kind: 'origin',
      layer: goalLayer,
    })
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
        branchId: 'branch-main',
        crossAxisPos: centerCrossAxis,
        kind: node.isStart ? 'origin' : 'forward',
        layer: computedLayer,
      } as BranchAssignment)
    
    const layerPos = computedLayer * FIXED_LAYER_SPACING
    const crossAxisPos = assignment.crossAxisPos
    const relativeCrossAxisPos = crossAxisPos - centerCrossAxis

    let targetX: number
    let targetY: number

    if (orientation === 'horizontal') {
      targetX = layerPos
      targetY = relativeCrossAxisPos
    } else {
      targetX = relativeCrossAxisPos
      targetY = layerPos
    }
    
    return {
      ...node,
      layer: computedLayer,
      computedLayer,
      targetX,
      targetY,
      absoluteY: crossAxisPos,
      branchId: assignment.branchId,
      parentId: assignment.parentId,
      branchType: assignment.kind,
    }
  })
  
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
