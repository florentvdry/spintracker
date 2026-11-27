import type { RespectTone } from '@/utils/rangeAdherence'

export type PaletteName = 'standard' | 'colorblind'

export const PALETTE_NAMES: readonly PaletteName[] = ['standard', 'colorblind']
export const DEFAULT_PALETTE: PaletteName = 'standard'
export const PALETTE_STORAGE_KEY = 'spintracker.palette'

export interface PaletteColors {
  profit: string
  loss: string
  respect: Record<RespectTone, string>
}

/**
 * The colour-blind palette uses the Okabe-Ito colours: blue and orange stay apart for people who
 * cannot tell red from green, which the default green/red pair relies on.
 */
const PALETTES: Record<PaletteName, PaletteColors> = {
  standard: {
    profit: '#3fd49a',
    loss: '#ff7a6b',
    respect: { good: '#2fd45a', ok: '#a6c93a', work: '#e8962d' },
  },
  colorblind: {
    profit: '#56b4e9',
    loss: '#e69f00',
    respect: { good: '#56b4e9', ok: '#009e73', work: '#e69f00' },
  },
}

let active: PaletteName = DEFAULT_PALETTE

export function colorsOf(name: PaletteName): PaletteColors {
  return PALETTES[name]
}

/** Colour of an adherence tone in the given palette (the active one by default). */
export function respectColor(tone: RespectTone, name: PaletteName = active): string {
  return PALETTES[name].respect[tone]
}

/** "#3fd49a" to "63 212 154", the form the Tailwind tokens read so that opacity modifiers work. */
export function hexToRgbTriplet(hex: string): string {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].join(' ')
}

export function isPaletteName(value: unknown): value is PaletteName {
  return typeof value === 'string' && (PALETTE_NAMES as readonly string[]).includes(value)
}

/** The palette the player chose on this machine; the default when nothing valid is stored. */
export function readPalette(): PaletteName {
  try {
    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY)
    return isPaletteName(stored) ? stored : DEFAULT_PALETTE
  } catch {
    // Storage can be blocked (private window): the default palette applies for this session.
    return DEFAULT_PALETTE
  }
}

export function writePalette(name: PaletteName): void {
  try {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, name)
  } catch {
    // Same as above: the choice then lasts for this session only.
  }
}

/** Makes `name` the active palette: the profit tokens of the stylesheet and the adherence colours follow it. */
export function applyPalette(name: PaletteName): void {
  active = name
  const root = document.documentElement
  root.dataset.palette = name
  root.style.setProperty('--profit-positive-rgb', hexToRgbTriplet(PALETTES[name].profit))
  root.style.setProperty('--profit-negative-rgb', hexToRgbTriplet(PALETTES[name].loss))
}
