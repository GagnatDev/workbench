import { describe, expect, it } from 'vitest'
import { matchesTags, collectTags } from './tags'

describe('matchesTags (local filtering, AND semantics)', () => {
  it('an empty filter matches everything', () => {
    expect(matchesTags(['raku'], [])).toBe(true)
    expect(matchesTags(undefined, [])).toBe(true)
  })

  it('requires every active tag to be present', () => {
    expect(matchesTags(['raku', 'blue'], ['raku'])).toBe(true)
    expect(matchesTags(['raku', 'blue'], ['raku', 'blue'])).toBe(true)
    expect(matchesTags(['raku'], ['raku', 'blue'])).toBe(false)
    expect(matchesTags(undefined, ['raku'])).toBe(false)
  })
})

describe('collectTags', () => {
  it('returns distinct tags, sorted, tolerating missing arrays', () => {
    const rows = [{ tags: ['b', 'a'] }, { tags: ['a'] }, {}, { tags: ['c'] }]
    expect(collectTags(rows)).toEqual(['a', 'b', 'c'])
  })
})
