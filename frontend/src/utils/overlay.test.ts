import { describe, expect, it } from 'vitest'
import { overlayUrl, parseOverlayPort } from './overlay'

describe('parseOverlayPort', () => {
  it('accepts a whole number in the usable range', () => {
    expect(parseOverlayPort(' 7779 ')).toBe(7779)
    expect(parseOverlayPort('1024')).toBe(1024)
  })

  it('refuses reserved, too large, decimal or empty values', () => {
    expect(parseOverlayPort('80')).toBeNull()
    expect(parseOverlayPort('70000')).toBeNull()
    expect(parseOverlayPort('77.7')).toBeNull()
    expect(parseOverlayPort('')).toBeNull()
  })
})

describe('overlayUrl', () => {
  it('always points at the loopback address', () => {
    expect(overlayUrl(7779)).toBe('http://127.0.0.1:7779/')
  })
})
