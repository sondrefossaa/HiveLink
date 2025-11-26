import type { GraphEdge, GraphNode } from '@/types'

// Constants - DO NOT MODIFY THESE
export const FIXED_HORIZONTAL_SPACING = 300
export const SIDE_BRANCH_VERTICAL_OFFSET = 80
export const FORWARD_VERTICAL_SPACING = 110
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

/**
 * Resolve node ID from edge endpoint (string or node object)
 */
const resolveId = (endpoint: string | GraphNode): string =>
  typeof endpoint === 'string' ? endpoint : endpoint.id

/**
 * Determine if an edge represents a forward branch (extends last part) or side branch (extends first part)
 * This is CRITICAL for layout rules
 * 
 * Forward branch = extends LAST part of parent (e.g., butterfly -> dragonfly, shares "fly")
 * Side branch = extends FIRST part of parent (e.g., butterfly -> butterfinger, shares "butter")
 */
function isForwardBranch(
  edge: GraphEdge,
  parentNode: GraphNode,
  childNode: GraphNode
): boolean {
  const sharedPart = edge.sharedPart.toLowerCase()
  const parentParts = parentNode.parts.map(p => p.toLowerCase())
  
  if (parentParts.length === 0) {
    return true // Default to forward
  }
  
  // Check if shared part is the LAST part of parent (forward) or FIRST part (side)
  const lastPart = parentParts[parentParts.length - 1]
  const firstPart = parentParts[0]
  
  // If shared part matches the last part, it's a forward branch
  if (lastPart === sharedPart) {
    return true
  }
  
  // If shared part matches the first part, it's a side branch
  if (firstPart === sharedPart) {
    return false
  }
  
  // Fallback: check if node has expandsForward property set
  // This handles cases where edge info might not perfectly match
  if ('expandsForward' in childNode && childNode.expandsForward !== undefined) {
    return childNode.expandsForward
  }
  
  // Default to forward if we can't determine
  return true
}

/**
 * Calculate layer for a node based on its distance from start node
 * Layer 0 = start node
 * Layer N+1 = node connected from a layer N node
 */
function calculateLayer(
  nodeId: string,
  startNodeId: string | undefined,
  adjacency: Map<string, string[]>,
  nodeMap: Map<string, GraphNode>
): number {
  if (nodeId === startNodeId) return 0
  
  const node = nodeMap.get(nodeId)
  if (!node) return 0
  
  // If node already has a layer assigned, use it
  if (node.layer >= 0) return node.layer
  
  // BFS from start to calculate layer
  const layerMap = new Map<string, number>()
  const queue: string[] = []
  
  if (startNodeId) {
    layerMap.set(startNodeId, 0)
    queue.push(startNodeId)
  }
  
  while (queue.length > 0) {
    const currentId = queue.shift()!
    const currentLayer = layerMap.get(currentId) ?? 0
    const children = adjacency.get(currentId) ?? []
    
    for (const childId of children) {
      const childNode = nodeMap.get(childId)
      // Skip goal node in layer calculation
      if (childNode?.isGoal) continue
      
      const nextLayer = currentLayer + 1
      if (!layerMap.has(childId) || nextLayer < (layerMap.get(childId) ?? Infinity)) {
        layerMap.set(childId, nextLayer)
        queue.push(childId)
      }
    }
  }
  
  return layerMap.get(nodeId) ?? 0
}

/**
 * Find the primary parent for a node (highest layer non-goal parent)
 */
function findPrimaryParent(
  nodeId: string,
  incoming: Map<string, string[]>,
  layerMap: Map<string, number>,
  nodeMap: Map<string, GraphNode>,
  goalNodeId?: string
): string | undefined {
  const possibleParents = incoming.get(nodeId) ?? []
  if (possibleParents.length === 0) return undefined
  
  let selected: string | undefined
  let highestLayer = -Infinity
  
  for (const parentId of possibleParents) {
    // Skip goal node as parent (unless it's the only option)
    if (parentId === goalNodeId && possibleParents.length > 1) continue
    
    const layer = layerMap.get(parentId)
    if (layer !== undefined && layer > highestLayer) {
      selected = parentId
      highestLayer = layer
    }
  }
  
  return selected ?? possibleParents[0]
}

/**
 * Calculate vertical offset for side branches
 * Creates evenly spaced offsets: +80, +160, -80, -160, +240, -240, etc.
 */
function calculateSideBranchOffset(index: number): number {
  const magnitude = Math.floor(index / 2) + 1
  const direction = index % 2 === 0 ? 1 : -1
  return direction * magnitude * SIDE_BRANCH_VERTICAL_OFFSET
}

/**
 * Calculate forward-branch offset so siblings fan out (+, -, ++, --, etc.)
 */
function calculateForwardBranchOffset(slotIndex: number): number {
  if (slotIndex === 0) return 0
  const magnitude = Math.floor((slotIndex + 1) / 2)
  const direction = slotIndex % 2 === 1 ? 1 : -1
  return direction * magnitude * FORWARD_VERTICAL_SPACING
}

/**
 * Claim a forward slot for a branch/layer/parent combination
 */
function claimForwardSlot(
  registry: Map<string, number>,
  branchId: string,
  layer: number,
  parentId?: string
): number {
  const key = `${branchId}:${layer}:${parentId ?? 'root'}`
  const slotIndex = registry.get(key) ?? 0
  registry.set(key, slotIndex + 1)
  return slotIndex
}

/**
 * Generate unique branch ID for tracking vertical lineage
 */
function generateBranchId(
  parentBranchId: string,
  isSideBranch: boolean,
  sideIndex: number
): string {
  if (!isSideBranch) {
    // Forward branch inherits parent's branch ID
    return parentBranchId
  }
  
  // Side branch gets unique ID
  return `${parentBranchId}-side-${sideIndex}`
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
  
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  
  // Build adjacency and incoming maps
  const adjacency = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  const edgeMap = new Map<string, GraphEdge>() // Map edge id to edge for quick lookup
  
  edges.forEach((edge) => {
    const sourceId = resolveId(edge.source)
    const targetId = resolveId(edge.target)
    
    if (!adjacency.has(sourceId)) adjacency.set(sourceId, [])
    adjacency.get(sourceId)!.push(targetId)
    
    if (!incoming.has(targetId)) incoming.set(targetId, [])
    incoming.get(targetId)!.push(sourceId)
    
    // Store edge by (source, target) for quick lookup
    edgeMap.set(`${sourceId}->${targetId}`, edge)
  })
  
  // Calculate layers for all nodes (BFS from start)
  const layerMap = new Map<string, number>()
  const queue: string[] = []
  
  layerMap.set(startNode.id, 0)
  queue.push(startNode.id)
  
  while (queue.length > 0) {
    const currentId = queue.shift()!
    const currentLayer = layerMap.get(currentId) ?? 0
    const children = adjacency.get(currentId) ?? []
    
    for (const childId of children) {
      const childNode = nodeMap.get(childId)
      // Skip goal node in layer calculation
      if (childNode?.isGoal) continue
      
      const nextLayer = currentLayer + 1
      if (!layerMap.has(childId) || nextLayer < (layerMap.get(childId) ?? Infinity)) {
        layerMap.set(childId, nextLayer)
        queue.push(childId)
      }
    }
  }
  
  // Ensure all nodes have layers
  nodes.forEach((node) => {
    if (!layerMap.has(node.id)) {
      if (node.isStart) {
        layerMap.set(node.id, 0)
      } else if (node.layer >= 0) {
        layerMap.set(node.id, node.layer)
      } else {
        layerMap.set(node.id, 0)
      }
    }
  })
  
  // Calculate max layer and goal layer
  const nonGoalLayers = nodes
    .filter((node) => !node.isGoal && node.id !== goalNode?.id)
    .map((node) => layerMap.get(node.id) ?? 0)
  
  const maxLayer = nonGoalLayers.length > 0 ? Math.max(...nonGoalLayers) : 0
  const goalLayer = Math.max(maxLayer + 1, MIN_GOAL_LAYER)
  
  // Goal node is pinned at max layer, vertically centered
  const centerY = canvasHeight / 2
  
  // Branch assignment system
  const branchAssignments = new Map<string, BranchAssignment>()
  const forwardSlotRegistry = new Map<string, number>()
  const sideBranchIndexMap = new Map<string, number>() // parentBranchId -> next side index
  
  // Initialize main branch
  // Assign start node to main branch at center
  branchAssignments.set(startNode.id, {
    branchId: 'branch-main',
    absoluteY: centerY,
    kind: 'origin',
    layer: 0,
  })
  
  // Sort nodes by layer (process layer by layer)
  const sortedNodes = [...nodes]
    .filter(n => !n.isStart && n.id !== goalNode?.id)
    .sort((a, b) => {
      const layerA = layerMap.get(a.id) ?? 0
      const layerB = layerMap.get(b.id) ?? 0
      if (layerA !== layerB) return layerA - layerB
      // Within same layer, process by order added (preserve node order)
      return 0
    })
  
  // Process each node in layer order
  for (const node of sortedNodes) {
    const nodeLayer = layerMap.get(node.id) ?? 0
    const parentId = findPrimaryParent(node.id, incoming, layerMap, nodeMap, goalNode?.id)
    
    if (!parentId) {
      // No parent found - assign to main branch
      branchAssignments.set(node.id, {
        branchId: 'branch-main',
        absoluteY: centerY,
        kind: 'forward',
        layer: nodeLayer,
        parentId,
      })
      continue
    }
    
    const parentAssignment = branchAssignments.get(parentId)
    if (!parentAssignment) {
      // Parent not processed yet - assign to main branch (shouldn't happen with sorted processing)
      branchAssignments.set(node.id, {
        branchId: 'branch-main',
        absoluteY: centerY,
        kind: 'forward',
        layer: nodeLayer,
        parentId,
      })
      continue
    }
    
    // Find the edge connecting parent to this node
    const edge = edgeMap.get(`${parentId}->${node.id}`)
    const parentNode = nodeMap.get(parentId)
    
    if (!edge || !parentNode) {
      // No edge found - assign to main branch
      branchAssignments.set(node.id, {
        branchId: 'branch-main',
        absoluteY: centerY,
        kind: 'forward',
        layer: nodeLayer,
        parentId,
      })
      continue
    }
    
    // Determine if this is a forward branch or side branch
    const isForward = isForwardBranch(edge, parentNode, node)
    
    if (isForward) {
      // Forward branch: same lineage but allow fan-out per layer
      const slotIndex = claimForwardSlot(
        forwardSlotRegistry,
        parentAssignment.branchId,
        nodeLayer,
        parentId
      )
      const absoluteY = parentAssignment.absoluteY + calculateForwardBranchOffset(slotIndex)

      branchAssignments.set(node.id, {
        branchId: parentAssignment.branchId,
        absoluteY,
        kind: 'forward',
        layer: nodeLayer,
        parentId,
      })
    } else {
      // Side branch: offset vertically from parent
      const sideIndex = sideBranchIndexMap.get(parentAssignment.branchId) ?? 0
      const offset = calculateSideBranchOffset(sideIndex)
      const newBranchId = generateBranchId(parentAssignment.branchId, true, sideIndex)
      const absoluteY = parentAssignment.absoluteY + offset
      
      branchAssignments.set(node.id, {
        branchId: newBranchId,
        absoluteY,
        kind: 'side',
        layer: nodeLayer,
        parentId,
      })
      
      sideBranchIndexMap.set(parentAssignment.branchId, sideIndex + 1)
    }
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
