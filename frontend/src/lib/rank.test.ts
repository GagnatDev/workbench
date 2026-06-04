import { describe, expect, it } from 'vitest'
import { rankAfter, rankBefore, rankBetween } from './rank'

describe('rankBetween', () => {
  it('mints a first rank with room on both sides', () => {
    const r = rankBetween(null, null)
    expect(rankBefore(r) < r).toBe(true)
    expect(rankAfter(r) > r).toBe(true)
  })

  it('produces a value strictly between two ranks', () => {
    const a = rankBetween(null, null)
    const b = rankAfter(a)
    const mid = rankBetween(a, b)
    expect(a < mid).toBe(true)
    expect(mid < b).toBe(true)
  })

  it('orders a sequence of appends', () => {
    const ranks: string[] = []
    let prev: string | null = null
    for (let i = 0; i < 25; i++) {
      prev = rankAfter(prev)
      ranks.push(prev)
    }
    const sorted = [...ranks].sort()
    expect(ranks).toEqual(sorted)
  })

  it('survives repeated insert-between (always finds room)', () => {
    let lo = rankBetween(null, null)
    let hi = rankAfter(lo)
    for (let i = 0; i < 40; i++) {
      const mid = rankBetween(lo, hi)
      expect(lo < mid && mid < hi).toBe(true)
      hi = mid // keep squeezing into the lower half
    }
  })
})
