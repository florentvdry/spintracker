import { describe, expect, it } from 'vitest'
import { hudSupported, isMac } from './platform'

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0'

describe('platform', () => {
  it('knows a Mac from a Windows PC', () => {
    expect(isMac(MAC)).toBe(true)
    expect(isMac(WINDOWS)).toBe(false)
    expect(isMac('')).toBe(false)
  })

  it('offers the HUD on Windows only', () => {
    expect(hudSupported(WINDOWS)).toBe(true)
    expect(hudSupported(MAC)).toBe(false)
  })
})
