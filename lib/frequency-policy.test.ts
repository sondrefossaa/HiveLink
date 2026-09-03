import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compoundFamiliarity,
  generationTier,
  normalizedContinuationRank,
  weakestEdgeScore,
} from './frequency-policy'

test('normalizes continuation rank by branching factor', () => {
  assert.equal(normalizedContinuationRank(1, 100), 1)
  assert.equal(normalizedContinuationRank(100, 100), 0)
  assert.equal(normalizedContinuationRank(1, 1), 1)
  assert.ok(normalizedContinuationRank(5, 100) > normalizedContinuationRank(5, 10))
})

test('requires absolute familiarity and salience independently', () => {
  assert.equal(generationTier(0.2, 1), -1)
  assert.equal(generationTier(1, 0.2), -1)
  assert.equal(generationTier(0.9, 0.99), 0)
  assert.equal(generationTier(0.7, 0.9), 1)
})

test('keeps NoWaC lemma frequency dominant and scores paths by their weakest edge', () => {
  assert.equal(compoundFamiliarity({ nb: 0, nowacLemma: 1, eiesland: 0 }), 0.6)
  assert.equal(compoundFamiliarity({ nb: 1, nowacLemma: 0, eiesland: 0 }), 0.3)
  assert.equal(weakestEdgeScore([0.92, 0.61, 0.88]), 0.61)
})
