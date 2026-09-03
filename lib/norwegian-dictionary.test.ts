import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isNorwegianWordish,
  normalizeNo,
  sanitizeNorwegianWordInput,
} from './norwegian-dictionary'
import { quickValidate } from './quick-validation'
import { isValidPlayerName } from './player-id'

test('normalizes Norwegian letters without replacing them', () => {
  assert.equal(normalizeNo('  ÆØÅ  '), 'æøå')
  assert.equal(normalizeNo('A\u030A'), 'å')
})

test('sanitizes word input while preserving Norwegian letters', () => {
  assert.equal(sanitizeNorwegianWordInput(' BlÅbÆr-ØL! '), 'blåbærøl')
  assert.equal(sanitizeNorwegianWordInput('bla\u030Abær'), 'blåbær')
})

test('recognizes and validates Norwegian word input', () => {
  assert.equal(isNorwegianWordish('blåbærøl'), true)
  assert.equal(isNorwegianWordish('blåbær-øl'), false)
  assert.deepEqual(quickValidate('blåbærøl'), { valid: true })
})

test('accepts Norwegian letters in player names', () => {
  assert.equal(isValidPlayerName('Ægir Ødegård'), true)
  assert.equal(isValidPlayerName('Spiller_42'), true)
  assert.equal(isValidPlayerName('Navn?'), false)
})
