import { describe, expect, it } from 'vitest'
import { validatePayload, emptyPayload } from './payload'

describe('payload validation', () => {
  it('accepts well-formed payloads per kind', () => {
    expect(validatePayload('journal', { entry_at: new Date().toISOString() })).toBeTruthy()
    expect(validatePayload('checklist', { done: true })).toEqual({ done: true })
    expect(validatePayload('moodboard', { subtype: 'image' })).toEqual({ subtype: 'image' })
    expect(validatePayload('moodboard', { subtype: 'link', url: 'x' })).toBeTruthy()
    expect(validatePayload('materials', { quantity: '2', unit: 'kg' })).toBeTruthy()
  })

  it('rejects malformed payloads', () => {
    expect(() => validatePayload('journal', {})).toThrow() // entry_at required
    expect(() => validatePayload('checklist', { done: 'yes' })).toThrow()
    expect(() => validatePayload('moodboard', { subtype: 'link' })).toThrow() // url required
    expect(() => validatePayload('moodboard', { subtype: 'other' })).toThrow()
  })

  it('emptyPayload produces a valid starting payload for every kind', () => {
    for (const kind of ['journal', 'checklist', 'moodboard', 'materials'] as const) {
      expect(() => validatePayload(kind, emptyPayload(kind))).not.toThrow()
    }
  })
})
