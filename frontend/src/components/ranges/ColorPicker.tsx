import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { COLOR_SHADES, HEX_COLOR } from '@/utils/ranges'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  /** Accessible name of the button that opens the picker. */
  label: string
}

/** A colour swatch that opens the 16 proposed shades and a hex field. */
export default function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(value)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => setHex(value), [value])

  useEffect(() => {
    if (!open) return undefined
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const commit = (next: string) => {
    if (HEX_COLOR.test(next)) onChange(next.toLowerCase())
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-5 h-5 rounded-md border border-dark-100 block"
        style={{ backgroundColor: value }}
      />
      {open && (
        <div className="absolute z-30 mt-2 left-0 p-3 rounded-lg border border-dark-100 bg-dark-300 shadow-xl w-[188px]">
          <div className="grid grid-cols-8 gap-1.5">
            {COLOR_SHADES.map((shade) => (
              <button
                key={shade}
                type="button"
                aria-label={shade}
                aria-pressed={shade === value}
                onClick={() => {
                  onChange(shade)
                  setOpen(false)
                }}
                className={clsx('w-4 h-4 rounded-[4px] border', shade === value ? 'border-white' : 'border-dark-100')}
                style={{ backgroundColor: shade }}
              />
            ))}
          </div>
          <input
            className="input mt-3 font-mono text-xs"
            aria-label={t('ranges.colors.hex')}
            value={hex}
            maxLength={7}
            onChange={(e) => {
              setHex(e.target.value)
              commit(e.target.value)
            }}
          />
        </div>
      )}
    </div>
  )
}
