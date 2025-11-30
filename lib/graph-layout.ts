import type { GraphEdge, GraphNode } from '@/types'

const BASE_LAYER_SPACING = 120
const MIN_LAYER_SPACING_BETWEEN = 70
const MAX_LAYER_SPACING_BETWEEN = 90
export const FIXED_HORIZONTAL_SPACING = 100 // For backward compatibility with Graph.tsx
const BASE_FORWARD_CONFLICT_SPACING = 150
const BASE_CANVAS_SIZE = 640
const MIN_VERTICAL_SCALE = 1
const MAX_VERTICAL_SCALE = 1.8
const MIN_GOAL_LAYER = 3
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
 * Rebalance layer positions for clean, centered layout
 * Uses iterative relaxation to minimize edge crossings and spread nodes evenly
 * Prioritizes nodes with forward paths (descendants) toward the center
 */
function rebalanceLayerPositions(
  nodes: GraphNode[],
  edges: GraphEdge[],
  branchAssignments: Map<string, BranchAssignment>,
  centerCrossAxis: number,
  layerMap: Map<string, number>
): void {
  // Group nodes by layer
  const nodesByLayer = new Map<number, string[]>()
  for (const [nodeId, assignment] of branchAssignments.entries()) {
    const layer = assignment.layer
    if (!nodesByLayer.has(layer)) {
      nodesByLayer.set(layer, [])
    }
    nodesByLayer.get(layer)!.push(nodeId)
  }
  
  // Build adjacency for neighbor calculations (only forward edges between different layers)
  const childrenMap = new Map<string, string[]>()
  const parentsMap = new Map<string, string[]>()
  for (const edge of edges) {
    const sourceId = typeof edge.source === 'string' ? edge.source : (edge.source as GraphNode)?.id
    const targetId = typeof edge.target === 'string' ? edge.target : (edge.target as GraphNode)?.id
    if (!sourceId || !targetId) continue
    
    const sourceLayer = layerMap.get(sourceId)
    const targetLayer = layerMap.get(targetId)
    
    // Skip same-layer edges - they shouldn't affect horizontal positioning
    if (sourceLayer === targetLayer) continue
    
    if (!childrenMap.has(sourceId)) childrenMap.set(sourceId, [])
    childrenMap.get(sourceId)!.push(targetId)
    
    if (!parentsMap.has(targetId)) parentsMap.set(targetId, [])
    parentsMap.get(targetId)!.push(sourceId)
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
  for (const [nodeId] of branchAssignments.entries()) {
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
        
        let sum = 0
        let count = 0
        
        // Parents have lower weight
        for (const parentId of parents) {
          const parentAssignment = branchAssignments.get(parentId)
          if (parentAssignment) {
            sum += parentAssignment.crossAxisPos * 0.5
            count += 0.5
          }
        }
        
        // Children have higher weight - they pull the node toward the path to goal
        for (const childId of children) {
          const childAssignment = branchAssignments.get(childId)
          if (childAssignment) {
            sum += childAssignment.crossAxisPos * 1.5
            count += 1.5
          }
        }
        
        // Nodes with descendants get pulled toward center
        if (hasDescendants) {
          const descendantWeight = Math.min((descendantCount.get(nodeId) || 0) * 0.3, 2)
          sum += centerCrossAxis * descendantWeight
          count += descendantWeight
        }
        
        const barycenter = count > 0 ? sum / count : branchAssignments.get(nodeId)!.crossAxisPos
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
      const currentPositions = barycenters.map(b => branchAssignments.get(b.nodeId)!.crossAxisPos)
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
        const assignment = branchAssignments.get(item.nodeId)!
        const idealPos = startPos + (index * actualSpread / Math.max(totalNodes - 1, 1))
        
        // Nodes with descendants get pulled more strongly toward their ideal (centered) position
        const descendantBonus = item.hasDescendants ? 0.15 : 0
        const blendFactor = (iter === iterations - 1 ? 0.8 : 0.5) + descendantBonus
        assignment.crossAxisPos = assignment.crossAxisPos * (1 - blendFactor) + idealPos * blendFactor
      })
    }
  }
  
  // Final centering pass - apply progressive centering (stronger for layers closer to goal)
  // Reorder nodes so those with descendants are closer to center, then center the whole layer
  const maxLayerInGraph = Math.max(...Array.from(nodesByLayer.keys()))
  
  for (const [layer, nodeIds] of nodesByLayer.entries()) {
    if (nodeIds.length <= 1) continue;

    // Get node parts for sorting
    const nodePartsMap = new Map<string, string[]>();
    for (const nodeId of nodeIds) {
      const node = nodes.find(n => n.id === nodeId);
      nodePartsMap.set(nodeId, node?.parts ?? []);
    }

    // Group nodes by shared part
    const groups: string[][] = [];
    const used = new Set<string>();
    for (const nodeId of nodeIds) {
      if (used.has(nodeId)) continue;
      const partsA = nodePartsMap.get(nodeId) ?? [];
      const group = [nodeId];
      used.add(nodeId);
      for (const otherId of nodeIds) {
        if (used.has(otherId) || otherId === nodeId) continue;
        const partsB = nodePartsMap.get(otherId) ?? [];
        if (partsA.some(part => partsB.includes(part))) {
          group.push(otherId);
          used.add(otherId);
        }
      }
      groups.push(group);
    }

    // Calculate spread and center, but ensure minimum spacing
    const minSpacing = 60;
    const maxAllowedSpread = 220; // Limit max spread for layer
    const requiredSpread = minSpacing * (nodeIds.length - 1);
    const actualSpread = Math.max(Math.min(requiredSpread, maxAllowedSpread), requiredSpread);
    const startPos = centerCrossAxis - actualSpread / 2;

    // Place groups together, lone nodes near their parent, but always enforce minSpacing between all nodes
    let index = 0;
    for (const group of groups) {
      if (group.length === 1) {
        const nodeId = group[0];
        const assignment = branchAssignments.get(nodeId)!;
        const parentId = assignment.parentId;
        const parentPos = parentId ? branchAssignments.get(parentId)?.crossAxisPos : centerCrossAxis;
        // Clamp lone node within layer spread, but also ensure it doesn't overlap neighbors
        let newPos = clampValue(parentPos ?? startPos, startPos, startPos + actualSpread);
        // If not first, ensure spacing from previous
        if (index > 0) {
          const prevNodeId = nodeIds[index - 1];
          const prevPos = branchAssignments.get(prevNodeId)!.crossAxisPos;
          if (newPos - prevPos < minSpacing) {
            newPos = prevPos + minSpacing;
          }
        }
        assignment.crossAxisPos = newPos;
        index++;
      } else {
        // Place grouped nodes together, enforcing minSpacing
        for (const nodeId of group) {
          let newPos = startPos + (index * minSpacing);
          // If not first, ensure spacing from previous
          if (index > 0) {
            const prevNodeId = nodeIds[index - 1];
            const prevPos = branchAssignments.get(prevNodeId)!.crossAxisPos;
            if (newPos - prevPos < minSpacing) {
              newPos = prevPos + minSpacing;
            }
          }
          branchAssignments.get(nodeId)!.crossAxisPos = newPos;
          index++;
        }
      }
    }
  }
}

/**
 * MAIN LAYOUT FUNCTION - Enforces strict layout rules
 */
export function computeGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  canvasCrossAxisSize: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
  spacingMultiplier: number = 100,
  autoBalance: boolean = true
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
  // Forward expansion increments layer, side expansion stays on same layer
  const layerMap = buildLayerMap(startNode.id, adjacency, nodeMap, edgeMap, goalNode?.id)

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

    // Always bias new nodes toward the goal's Y position (centerCrossAxis)
    // This creates a "pointing toward goal" effect
    const layerProgress = Math.min(layer / Math.max(goalLayer, 1), 1) // 0 at start, 1 at goal
    const goalBias = 0.3 + 0.4 * layerProgress // 30-70% bias toward goal center
    const goalBiasedPreferred = preferredPos + (centerCrossAxis - preferredPos) * goalBias

    // When we need to offset due to collisions, ALWAYS prefer the direction toward goal (center)
    // This ensures new nodes are placed on the side of their parent that points toward goal
    const goalDirection = centerCrossAxis > goalBiasedPreferred ? 1 : -1
    
    const offsets: number[] = [0]
    for (let step = 1; step <= MAX_OFFSET_STEPS; step++) {
      const delta = step * forwardConflictUnit * 0.35 + MIN_LAYER_SPACING
      // ALWAYS try goal-side offset first, then opposite side
      offsets.push(delta * goalDirection, -delta * goalDirection)
    }

    let bestCandidate: number | undefined
    let bestScore = -Infinity

    for (const offset of offsets) {
      const candidate = clampValue(goalBiasedPreferred + offset, crossAxisMargin, safeCanvasSize - crossAxisMargin)
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
      
      // Add goal proximity score - reward positions closer to goal's Y (center)
      const distanceToGoalCenter = Math.abs(candidate - centerCrossAxis)
      const maxDistance = safeCanvasSize / 2
      const goalProximityScore = 1 - (distanceToGoalCenter / maxDistance)
      
      // Weight scores: parent closeness, edge spacing, global spacing, goal proximity
      const score = closenessScore * 0.25 + edgeSpacingScore * 0.35 + globalSpacingScore * 0.25 + goalProximityScore * 0.15

      if (score > bestScore) {
        bestScore = score
        bestCandidate = candidate
      }
    }

    const fallbackCandidate = bestCandidate ?? clampValue(goalBiasedPreferred, crossAxisMargin, safeCanvasSize - crossAxisMargin)
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

    // Check if node is a dead-end (no forward edge toward goal)
    let crossAxisPos: number
    const hasForwardEdge = edges.some(e => resolveNodeId(e.source) === node.id && layerMap.get(resolveNodeId(e.target))! > nodeLayer)
    if (!hasForwardEdge) {
      // Place dead-end node directly between parent and goal
      if (parentAssignment) {
        crossAxisPos = parentAssignment.crossAxisPos + (centerCrossAxis - parentAssignment.crossAxisPos) * 0.7
      } else {
        crossAxisPos = centerCrossAxis
      }
    } else {
      crossAxisPos = selectLayerPosition(nodeLayer, preferredPos, parentId, alignmentTarget)
    }

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
  
  // Rebalance vertical positions to center deeper branches (if enabled)
  if (autoBalance) {
    rebalanceLayerPositions(nodes, edges, branchAssignments, centerCrossAxis, layerMap)
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
