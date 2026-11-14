import { useTranslation } from 'react-i18next'
import { IMMEDIATES, RESPONSES, SIZE_UNITS, type Immediate, type RangeAction, type Response, type SizeUnit } from '@/utils/ranges'
import ActionChip from './ActionChip'
import ColorPicker from './ColorPicker'

/** An action being edited: the size stays text until it is saved. */
export interface ActionDraft {
  id?: number
  label: string
  color: string
  immediate: Immediate
  sizeValue: string
  sizeUnit: SizeUnit
  response: Response
}

export const NEW_ACTION_COLOR = '#a07cf0'

export function emptyDraft(): ActionDraft {
  return { label: '', color: NEW_ACTION_COLOR, immediate: 'raise', sizeValue: '', sizeUnit: 'bb', response: 'none' }
}

export function draftOf(action: RangeAction): ActionDraft {
  return {
    id: action.id,
    label: action.label,
    color: action.color,
    immediate: action.immediate,
    sizeValue: action.sizeValue === null ? '' : String(action.sizeValue),
    sizeUnit: action.sizeUnit ?? 'bb',
    response: action.response,
  }
}

/** The body the backend expects; `null` when the size is not a positive number. */
export function draftToInput(draft: ActionDraft): Record<string, unknown> | null {
  const size = draft.sizeValue.trim() === '' ? null : Number(draft.sizeValue.replace(',', '.'))
  if (size !== null && !(size > 0)) return null
  return {
    id: draft.id,
    label: draft.label.trim(),
    color: draft.color,
    immediate: draft.immediate,
    sizeValue: size,
    sizeUnit: size === null ? null : draft.sizeUnit,
    response: draft.response,
  }
}

export function isDraftValid(draft: ActionDraft): boolean {
  return draft.label.trim() !== '' && draftToInput(draft) !== null
}

interface ActionFieldsProps {
  draft: ActionDraft
  onChange: (draft: ActionDraft) => void
}

/** The fields of one action: label, colour, immediate action, size and planned response. */
export default function ActionFields({ draft, onChange }: ActionFieldsProps) {
  const { t } = useTranslation()
  const patch = (changes: Partial<ActionDraft>) => onChange({ ...draft, ...changes })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ColorPicker value={draft.color} onChange={(color) => patch({ color })} label={t('ranges.actions.color')} />
      <input
        className="input w-40"
        aria-label={t('ranges.actions.label')}
        placeholder={t('ranges.actions.label')}
        value={draft.label}
        maxLength={40}
        onChange={(e) => patch({ label: e.target.value })}
      />
      <select className="select w-32" aria-label={t('ranges.actions.immediate')} value={draft.immediate} onChange={(e) => patch({ immediate: e.target.value as Immediate })}>
        {IMMEDIATES.map((value) => (
          <option key={value} value={value}>
            {t(`ranges.immediate.${value}`)}
          </option>
        ))}
      </select>
      <input
        className="input w-16 font-mono text-right"
        aria-label={t('ranges.actions.size')}
        placeholder={t('ranges.actions.size')}
        inputMode="decimal"
        value={draft.sizeValue}
        onChange={(e) => patch({ sizeValue: e.target.value })}
      />
      <select className="select w-24" aria-label={t('ranges.actions.unit')} value={draft.sizeUnit} onChange={(e) => patch({ sizeUnit: e.target.value as SizeUnit })}>
        {SIZE_UNITS.map((value) => (
          <option key={value} value={value}>
            {t(`ranges.units.${value}`)}
          </option>
        ))}
      </select>
      <select className="select w-36" aria-label={t('ranges.actions.response')} value={draft.response} onChange={(e) => patch({ response: e.target.value as Response })}>
        {RESPONSES.map((value) => (
          <option key={value} value={value}>
            {t(`ranges.responses.${value}`)}
          </option>
        ))}
      </select>
      <ActionChip action={{ label: draft.label.trim() || '…', color: draft.color }} />
    </div>
  )
}
