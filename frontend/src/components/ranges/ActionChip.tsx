import clsx from 'clsx'
import { textColor, type RangeAction } from '@/utils/ranges'

interface ActionChipProps {
  action: Pick<RangeAction, 'label' | 'color'>
  /** Outline variant: the action that was played rather than the one in the range. */
  outline?: boolean
  className?: string
}

/** A pill in the colours of one of the player's actions. */
export default function ActionChip({ action, outline, className }: ActionChipProps) {
  const style = outline ? { borderColor: action.color, color: action.color } : { backgroundColor: action.color, borderColor: action.color, color: textColor(action.color) }
  return (
    <span className={clsx('inline-block rounded-md border px-2 py-0.5 text-xs font-semibold', className)} style={style}>
      {action.label}
    </span>
  )
}
