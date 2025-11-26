import type { GraphEdge, GraphNode } from '@/types'

export const FIXED_HORIZONTAL_SPACING = 300
const BASE_SIDE_BRANCH_VERTICAL_OFFSET = 120
const BASE_FORWARD_CONFLICT_SPACING = 150
const BASE_CANVAS_HEIGHT = 640
const MIN_VERTICAL_SCALE = 1
const MAX_VERTICAL_SCALE = 1.8
const MIN_GOAL_LAYER = 8
const MAX_GOAL_LAYER = 12

type BranchKind = 'origin' | 'forward' | 'side'

interface BranchAssignment {
  branchId: string
  absoluteY: number
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

const calculateSideBranchOffset = (index: number, unit: number): number => {
  const magnitude = Math.floor(index / 2) + 1
  const direction = index % 2 === 0 ? 1 : -1
  return direction * magnitude * unit
}

const claimSideBranchOffset = (
  registry: Map<string, number>,
  branchId: string,
  unit: number
): { offset: number; index: number } => {
  const nextIndex = registry.get(branchId) ?? 0
  registry.set(branchId, nextIndex + 1)
  return { offset: calculateSideBranchOffset(nextIndex, unit), index: nextIndex }
}

const calculateForwardConflictOffset = (slotIndex: number, unit: number): number => {
  if (slotIndex === 0) return 0
  const magnitude = Math.floor((slotIndex + 1) / 2)
  const direction = slotIndex % 2 === 1 ? 1 : -1
  return direction * magnitude * unit
}

const claimForwardConflictSlot = (
  registry: Map<string, number>,
  branchId: string,
  layer: number
): number => {
  const key = `${branchId}:${layer}`
  const slotIndex = (registry.get(key) ?? 0) + 1
  registry.set(key, slotIndex)
  return slotIndex
}

/**
 * MAIN LAYOUT FUNCTION - Enforces strict layout rules
 */
export function computeGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  canvasHeight: number
): GraphLayoutResult {
  const startNode = nodes.find((node) => node.isStart)
  const goalNode = nodes.find((node) => node.id === 'goal') || nodes.find((node) => node.isGoal)
  
  if (!startNode) {
    throw new Error('Start node is required')
  }
  
  const safeCanvasHeight = Math.max(canvasHeight, 480)
  const verticalScale = Math.max(
    MIN_VERTICAL_SCALE,
    Math.min(MAX_VERTICAL_SCALE, safeCanvasHeight / BASE_CANVAS_HEIGHT)
  )
  const sideOffsetUnit = BASE_SIDE_BRANCH_VERTICAL_OFFSET * verticalScale
  const forwardConflictUnit = BASE_FORWARD_CONFLICT_SPACING * verticalScale
  
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
  
  // Goal node is pinned at max layer, vertically centered
  const centerY = safeCanvasHeight / 2
  
  const branchAssignments = new Map<string, BranchAssignment>()
  const sideOffsetRegistry = new Map<string, number>()
  const forwardConflictRegistry = new Map<string, number>()
  const branchLayerOccupancy = new Map<string, string>()

  branchAssignments.set(startNode.id, {
    branchId: 'branch-main',
    absoluteY: centerY,
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

    let branchId = baseAssignment.branchId
    let absoluteY = baseAssignment.absoluteY
    let branchType: BranchKind = branchKind === 'side' ? 'side' : 'forward'

    if (branchKind === 'side') {
      const { offset, index } = claimSideBranchOffset(
        sideOffsetRegistry,
        baseAssignment.branchId,
        sideOffsetUnit
      )
      branchId = `${baseAssignment.branchId}-side-${index}`
      absoluteY = baseAssignment.absoluteY + offset
    } else {
      const occupancyKey = `${branchId}:${nodeLayer}`
      if (branchLayerOccupancy.has(occupancyKey)) {
        const conflictSlot = claimForwardConflictSlot(forwardConflictRegistry, branchId, nodeLayer)
        absoluteY =
          baseAssignment.absoluteY + calculateForwardConflictOffset(conflictSlot, forwardConflictUnit)
      }
      branchLayerOccupancy.set(occupancyKey, node.id)
    }

    branchAssignments.set(node.id, {
      branchId,
      absoluteY,
      kind: branchType,
      layer: nodeLayer,
      parentId,
    })
  }
  
  // Goal node is pinned at goal layer, vertically centered
  if (goalNode) {
    branchAssignments.set(goalNode.id, {
      branchId: 'branch-goal',
      absoluteY: centerY,
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
        absoluteY: centerY,
        kind: node.isStart ? 'origin' : 'forward',
        layer: computedLayer,
      } as BranchAssignment)
    
    // CRITICAL: X position is FIXED based on layer
    const targetX = computedLayer * FIXED_HORIZONTAL_SPACING
    
    // Y position is calculated from branch assignment
    const absoluteY = assignment.absoluteY
    const targetY = absoluteY // Use absolute Y directly (canvas coordinates)
    
    return {
      ...node,
      layer: computedLayer,
      computedLayer,
      targetX,
      targetY,
      absoluteY,
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
