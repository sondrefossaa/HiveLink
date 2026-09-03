import assert from 'node:assert/strict'
import test from 'node:test'
import { reachesGoalWord } from './goal'

test('sentralbord does not reach besitter (no inferred bordbesitter)', () => {
  assert.equal(reachesGoalWord('sentralbord', 'besitter'), false)
})

test('middagsbord does not reach besitter', () => {
  assert.equal(reachesGoalWord('middagsbord', 'besitter'), false)
})

test('bordbesitter reaches besitter when explicitly typed', () => {
  assert.equal(reachesGoalWord('bordbesitter', 'besitter'), true)
})

test('typing the goal word itself does not count as reaching it', () => {
  assert.equal(reachesGoalWord('besitter', 'besitter'), false)
  assert.equal(reachesGoalWord('bord', 'bord'), false)
})

test('matching is normalized and case-insensitive', () => {
  assert.equal(reachesGoalWord('Bordbesitter', 'besitter'), true)
  assert.equal(reachesGoalWord('  bordbesitter  ', 'Besitter'), true)
})

test('empty inputs never reach the goal', () => {
  assert.equal(reachesGoalWord('', 'besitter'), false)
  assert.equal(reachesGoalWord('bordbesitter', ''), false)
})
