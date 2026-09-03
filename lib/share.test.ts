import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOgImageUrl, buildShareText, buildShareUrl } from './share'

const result = {
  puzzleNumber: 42,
  wordsUsed: 2,
  layers: 3,
  status: 'won' as const,
  startWord: 'fot',
  goalWord: 'ball',
  isDaily: true,
  bestPath: ['fot', 'fotspor', 'sporvogn', 'ball'],
  pathsFound: 3,
}

test('shares the shortest path and total number of paths', () => {
  const text = buildShareText(result)

  assert.match(text, /3 stier funnet/)
  assert.match(text, /fot → fotspor → sporvogn → ball/)
  assert.match(text, /https:\/\/hivelink\.buzz\/\?puzzle=42/)
})

test('omits path details while no path has been found', () => {
  const text = buildShareText({ ...result, status: 'playing', bestPath: [], pathsFound: 0 })

  assert.doesNotMatch(text, /sti funnet/)
})

test('encodes practice puzzle and result image parameters', () => {
  assert.equal(
    buildShareUrl({
      startWord: 'blåbær',
      goalWord: 'bærbar',
      isDaily: false,
      difficulty: 'hard',
    }),
    'https://hivelink.buzz/?start=bl%C3%A5b%C3%A6r&goal=b%C3%A6rbar&difficulty=hard'
  )

  const imageUrl = new URL(buildOgImageUrl(result), 'https://hivelink.buzz')
  assert.equal(imageUrl.searchParams.get('paths'), '3')
  assert.deepEqual(imageUrl.searchParams.getAll('path'), result.bestPath)
})
