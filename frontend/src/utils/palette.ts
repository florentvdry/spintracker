/** The colours that carry a meaning (gain, loss, deviation...), in the default palette and a colour-blind one. */

export type PaletteName = 'default' | 'colorblind'
export const PALETTE_NAMES: PaletteName[] = ['default', 'colorblind']

export type RespectTone = 'good' | 'ok' | 'work'

export interface Palette {
  /** Gains, and what is going well. */
  positive: string
  /** Losses. */
  negative: string
  /** A deviation from the player's own range: never the colour of a loss. */
  deviation: string
  /** Share of followed decisions: from comfortable to still to work on. */
  respect: Record<RespectTone, string>
  /** A figure above or below the average of the pool, in the HUD. */
  poolAbove: string
  poolBelow: string
  /** A second series next to the gains on a chart. */
  secondary: string
}

/** Okabe-Ito colours: told apart by the common forms of colour blindness. Blue gains against orange losses. */
export const PALETTES: Record<PaletteName, Palette> = {
  default: {
    positive: '#3fd49a',
    negative: '#ff7a6b',
    deviation: '#f5c06b',
    respect: { good: '#2fd45a', ok: '#a6c93a', work: '#e8962d' },
    poolAbove: '#ff6b6b',
    poolBelow: '#5aa0ff',
    secondary: '#7aa7ff',
  },
  colorblind: {
    positive: '#56b4e9',
    negative: '#e69f00',
    deviation: '#cc79a7',
    respect: { good: '#56b4e9', ok: '#f0e442', work: '#e69f00' },
    poolAbove: '#e69f00',
    poolBelow: '#56b4e9',
    secondary: '#f0e442',
  },
}

export function isPaletteName(value: unknown): value is PaletteName {
  return PALETTE_NAMES.some((name) => name === value)
}

/** "#56b4e9" as "86 180 233": the form the CSS variables hold so Tailwind can apply an opacity to them. */
export function rgbTriplet(hex: string): string {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16))
  return channels.join(' ')
}
