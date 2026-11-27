import { describe, expect, it } from 'vitest'
import { formatStatPct } from './replayerHud'

describe('formatStatPct', () => {
  it('rounds the percentage', () => {
    expect(formatStatPct(31.6)).toBe('32 %')
  })

  it('shows a dash when nothing was counted', () => {
    expect(formatStatPct(null)).toBe('–')
  })
})
