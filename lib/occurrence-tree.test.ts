import assert from 'node:assert/strict'
import test from 'node:test'
import type { GraphEdge, GraphNode, NodeConnection } from '@/types'
import {
  chooseOccurrenceParent,
  isDistinctWordPath,
  traceOccurrencePath,
} from './occurrence-tree'
import { computeGraphLayout } from './graph-layout'

const node = (
  id: string,
  word: string,
  layer: number,
  parentId?: string
): GraphNode => ({
  id,
  word,
  parts: [word],
  layer,
  parentId,
  isStart: id === 'start',
  isGoal: false,
  isCompleted: false,
})

const connection = (parent: GraphNode): NodeConnection => ({
  node: parent,
  sharedPart: parent.word,
})

test('prefers a compatible selected parent over a shallower parent', () => {
  const start = node('start', 'fot', 0)
  const deeper = node('deeper', 'ball', 2, 'start')
  const selected = chooseOccurrenceParent(
    [connection(start), connection(deeper)],
    deeper.id,
    [start, deeper],
    [],
    'ballong'
  )

  assert.equal(selected?.node.id, deeper.id)
})

test('falls back to the shallowest parent and newest parent on a tie', () => {
  const start = node('start', 'fot', 0)
  const older = node('older', 'ball', 1, 'start')
  const newer = node('newer', 'hånd', 1, 'start')
  const deeper = node('deeper', 'luft', 2, 'older')
  const nodes = [start, older, newer, deeper]

  const shallowest = chooseOccurrenceParent(
    [connection(deeper), connection(older), connection(start)],
    null,
    nodes,
    [],
    'ballong'
  )
  assert.equal(shallowest?.node.id, start.id)

  const newestTie = chooseOccurrenceParent(
    [connection(older), connection(newer)],
    null,
    nodes,
    [],
    'ballong'
  )
  assert.equal(newestTie?.node.id, newer.id)
})

test('allows reuse on another branch but not beneath the same parent', () => {
  const start = node('start', 'fot', 0)
  const other = node('other', 'hånd', 1, 'start')
  const existing = node('existing', 'ballong', 1, 'start')
  const edges: GraphEdge[] = [{
    id: 'edge-start-existing',
    source: start.id,
    target: existing.id,
    sharedPart: 'fot',
  }]

  const selected = chooseOccurrenceParent(
    [connection(start), connection(other)],
    start.id,
    [start, other, existing],
    edges,
    'ballong'
  )

  assert.equal(selected?.node.id, other.id)
})

test('does not repeat a word within the same branch', () => {
  const start = node('start', 'fot', 0)
  const repeated = node('repeated', 'ballong', 1, 'start')
  const child = node('child', 'fly', 2, 'repeated')

  assert.equal(
    chooseOccurrenceParent(
      [connection(child)],
      child.id,
      [start, repeated, child],
      [],
      'ballong'
    ),
    null
  )
})

test('traces occurrence IDs and words from start to a goal leaf', () => {
  const start = node('start', 'fot', 0)
  const middle = node('middle', 'fotball', 1, 'start')
  const goal: GraphNode = {
    ...node('goal-1', 'ball', 2, 'middle'),
    isGoal: true,
    isCompleted: true,
  }

  assert.deepEqual(traceOccurrencePath(goal.id, [goal, start, middle]), {
    nodeIds: ['start', 'middle', 'goal-1'],
    words: ['fot', 'fotball', 'ball'],
  })
})

test('treats only exact normalized word sequences as duplicate paths', () => {
  const paths = [['Fot', 'fotball', 'ball']]
  assert.equal(isDistinctWordPath(['fot', 'fotball', 'ball'], paths), false)
  assert.equal(isDistinctWordPath(['fot', 'fotspor', 'spor'], paths), true)
})

test('lays out duplicate occurrences as separate non-overlapping tree branches', () => {
  const start = node('start', 'fot', 0)
  const left = node('left', 'fotball', 1, 'start')
  const right = node('right', 'fotball', 1, 'start')
  const leftGoal: GraphNode = {
    ...node('goal-left', 'ball', 2, 'left'),
    isGoal: true,
    isCompleted: true,
  }
  const rightGoal: GraphNode = {
    ...node('goal-right', 'ball', 2, 'right'),
    isGoal: true,
    isCompleted: true,
  }
  const edges: GraphEdge[] = [
    { id: 'start-left', source: 'start', target: 'left', sharedPart: 'fot' },
    { id: 'start-right', source: 'start', target: 'right', sharedPart: 'fot' },
    { id: 'left-goal', source: 'left', target: 'goal-left', sharedPart: 'ball' },
    { id: 'right-goal', source: 'right', target: 'goal-right', sharedPart: 'ball' },
  ]

  const layout = computeGraphLayout([start, left, right, leftGoal, rightGoal], edges)
  assert.notEqual(layout.nodeMeta.get('left')?.targetY, layout.nodeMeta.get('right')?.targetY)
  assert.notEqual(layout.nodeMeta.get('goal-left')?.targetY, layout.nodeMeta.get('goal-right')?.targetY)
  assert.equal(layout.nodeMeta.get('goal-left')?.parentId, 'left')
  assert.equal(layout.nodeMeta.get('goal-right')?.parentId, 'right')
})
