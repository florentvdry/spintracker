import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isPaletteName, PALETTES, rgbTriplet, type Palette, type PaletteName } from '@/utils/palette'

const STORAGE_KEY = 'spintracker-palette'

interface PaletteState {
  name: PaletteName
  setName: (name: PaletteName) => void
}

/** Puts the palette on the page: the CSS variables Tailwind's gain, loss and deviation colours read. */
export function applyPalette(name: PaletteName): void {
  const palette = PALETTES[name]
  const root = document.documentElement
  root.dataset.palette = name
  root.style.setProperty('--c-positive', rgbTriplet(palette.positive))
  root.style.setProperty('--c-negative', rgbTriplet(palette.negative))
  root.style.setProperty('--c-deviation', rgbTriplet(palette.deviation))
  // Plain colours, for the styles that read a variable directly.
  for (const [tone, color] of Object.entries(palette.respect)) root.style.setProperty(`--respect-${tone}`, color)
  root.style.setProperty('--pool-above', palette.poolAbove)
  root.style.setProperty('--pool-below', palette.poolBelow)
}

/** The global palette: shared by every window (the HUD included) through the browser storage. */
export const usePaletteStore = create<PaletteState>()(
  persist(
    (set) => ({
      name: 'default',
      setName: (name) => set({ name }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ name: state.name }),
      // A stored value from another version is ignored rather than trusted.
      merge: (stored, current) => ({ ...current, name: isPaletteName((stored as Partial<PaletteState> | undefined)?.name) ? (stored as PaletteState).name : current.name }),
    },
  ),
)

if (typeof document !== 'undefined') {
  applyPalette(usePaletteStore.getState().name)
  usePaletteStore.subscribe((state) => applyPalette(state.name))
  // Another window (the main one, while the HUD is open) changed the palette.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) void usePaletteStore.persist.rehydrate()
  })
}

/** The colours of the palette in force, for what CSS classes cannot reach (charts, SVG, the HUD). */
export function usePalette(): Palette {
  return PALETTES[usePaletteStore((s) => s.name)]
}
