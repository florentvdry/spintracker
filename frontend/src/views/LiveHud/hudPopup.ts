/** Where a popup grid opens: under the cell that was clicked, or over it when there is no room below. */

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

const POPUP_GAP_PX = 2

export function placePopup(anchor: Box, popup: { width: number; height: number }, viewport: { width: number; height: number }): { left: number; top: number } {
  const below = anchor.top + anchor.height + POPUP_GAP_PX
  const above = anchor.top - popup.height - POPUP_GAP_PX
  const top = below + popup.height <= viewport.height || above < 0 ? below : above
  const clamp = (value: number, size: number, limit: number) => Math.max(0, Math.min(value, limit - size))
  return { left: clamp(anchor.left, popup.width, viewport.width), top: clamp(top, popup.height, viewport.height) }
}
