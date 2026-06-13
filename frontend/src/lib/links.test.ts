import { describe, expect, it } from 'vitest'
import { domainOf, tokenizeLinks, withScheme } from './links'

describe('tokenizeLinks', () => {
  it('returns a single text token when there is no URL', () => {
    expect(tokenizeLinks('just some words')).toEqual([{ type: 'text', value: 'just some words' }])
  })

  it('detects http, https and bare www URLs', () => {
    expect(tokenizeLinks('https://a.com')).toEqual([{ type: 'url', value: 'https://a.com' }])
    expect(tokenizeLinks('http://a.com')).toEqual([{ type: 'url', value: 'http://a.com' }])
    expect(tokenizeLinks('www.a.com')).toEqual([{ type: 'url', value: 'www.a.com' }])
  })

  it('keeps surrounding text around a URL', () => {
    expect(tokenizeLinks('see https://a.com now')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'url', value: 'https://a.com' },
      { type: 'text', value: ' now' },
    ])
  })

  it('strips trailing sentence punctuation off the URL', () => {
    expect(tokenizeLinks('look at https://a.com.')).toEqual([
      { type: 'text', value: 'look at ' },
      { type: 'url', value: 'https://a.com' },
      { type: 'text', value: '.' },
    ])
  })

  it('finds multiple URLs in one string', () => {
    const tokens = tokenizeLinks('https://a.com and https://b.com')
    expect(tokens.filter((t) => t.type === 'url')).toEqual([
      { type: 'url', value: 'https://a.com' },
      { type: 'url', value: 'https://b.com' },
    ])
  })
})

describe('domainOf', () => {
  it('drops the www prefix', () => {
    expect(domainOf('https://www.youtube.com/watch?v=x')).toBe('youtube.com')
  })

  it('handles bare www links', () => {
    expect(domainOf('www.example.com/path')).toBe('example.com')
  })

  it('returns the input unchanged when unparseable', () => {
    expect(domainOf('not a url')).toBe('not a url')
  })
})

describe('withScheme', () => {
  it('leaves http(s) URLs alone and prefixes bare hosts', () => {
    expect(withScheme('https://a.com')).toBe('https://a.com')
    expect(withScheme('www.a.com')).toBe('https://www.a.com')
  })
})
