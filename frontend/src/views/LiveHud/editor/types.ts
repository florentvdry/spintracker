import type { Axis, EditAction } from '../hudEditor'

/** What is selected in the canvas. Cells and the track belong to the first selected grid. */
export interface Selection {
  gridIds: string[]
  cellIds: string[]
  track: { axis: Axis; index: number } | null
}

export const NO_SELECTION: Selection = { gridIds: [], cellIds: [], track: null }

export type Dispatch = (action: EditAction) => void

/** A cell being typed into: a real cell, or an `empty:<row>:<col>` slot that gets a cell on commit. */
export interface EditingCell {
  gridId: string
  cellId: string
}
