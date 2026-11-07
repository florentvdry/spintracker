import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ChevronDown, Redo2, Undo2 } from 'lucide-react'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { HUD_FORMATS, type HudFormat } from '../hudProfile'
import Dropdown from './Dropdown'
import ProfileMenu from './ProfileMenu'
import TablesPanel, { useTables } from './TablesPanel'

export type EditorView = 'grids' | 'table'

const VIEWS: EditorView[] = ['grids', 'table']

interface Props {
  format: HudFormat
  onFormat: (format: HudFormat) => void
  view: EditorView
  onView: (view: EditorView) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

function Segmented<T extends string>({ label, items, value, onChange }: { label: string; items: { id: T; text: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-md border border-dark-200 bg-dark-500 p-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={item.id === value}
          onClick={() => onChange(item.id)}
          className={clsx('rounded px-2.5 py-1 text-xs font-medium', item.id === value ? 'bg-primary-500 text-onprimary font-semibold' : 'text-gray-400 hover:text-gray-200')}
        >
          {item.text}
        </button>
      ))}
    </div>
  )
}

const buttonClass = (active: boolean) =>
  clsx('flex items-center gap-2 rounded-md border border-dark-100 px-2.5 py-1.5 text-[13px] text-gray-200 hover:border-gray-500', active ? 'bg-dark-200' : 'bg-dark-300')

/** Every global control of the HUD on one line: the switch, the profile, the table size, the view, undo and tables. */
export default function CommandBar({ format, onFormat, view, onView, canUndo, canRedo, onUndo, onRedo }: Props) {
  const { t } = useTranslation()
  const { settings, setEnabled } = useLiveHudStore()
  const tables = useTables()
  const [menu, setMenu] = useState<'profiles' | 'tables' | null>(null)
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const toAssociate = ((tables.view.tables ?? []) as { state: string }[]).filter((table) => table.state === 'toAssociate').length
  const close = () => setMenu(null)

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-dark-200 bg-dark-400 px-3 py-2">
      <button
        type="button"
        role="switch"
        aria-checked={settings.enabled}
        onClick={() => setEnabled(!settings.enabled)}
        className="flex items-center gap-2 rounded-full border border-dark-200 bg-dark-300 py-1 pl-1.5 pr-3 text-[13px] text-gray-200 hover:border-gray-500"
      >
        <span className={clsx('relative h-4 w-7 rounded-full transition-colors', settings.enabled ? 'bg-profit-positive' : 'bg-dark-50')}>
          <span className={clsx('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', settings.enabled ? 'left-3.5' : 'left-0.5')} />
        </span>
        <span className="font-semibold">{settings.enabled ? t('liveHud.live.on') : t('liveHud.live.off')}</span>
      </button>

      <Dropdown
        open={menu === 'profiles'}
        onClose={close}
        trigger={
          <button type="button" aria-haspopup="menu" aria-expanded={menu === 'profiles'} className={buttonClass(menu === 'profiles')} onClick={() => setMenu(menu === 'profiles' ? null : 'profiles')}>
            <span className="text-gray-400">{t('liveHud.editor.profile')}</span>
            <span className="max-w-[10rem] truncate font-semibold">{profile.name}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
        }
      >
        <ProfileMenu onClose={close} />
      </Dropdown>

      <Segmented label={t('liveHud.placement.format')} value={format} onChange={onFormat} items={HUD_FORMATS.map((f) => ({ id: f, text: t(`liveHud.format.${f}`) }))} />
      <Segmented label={t('liveHud.ws.view')} value={view} onChange={onView} items={VIEWS.map((v) => ({ id: v, text: t(`liveHud.ws.view_${v}`) }))} />

      <div className="flex gap-0.5">
        <button type="button" className="btn-icon disabled:opacity-40" title={`${t('liveHud.editor.undo')} (Ctrl+Z)`} aria-label={t('liveHud.editor.undo')} disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="h-4 w-4" />
        </button>
        <button type="button" className="btn-icon disabled:opacity-40" title={`${t('liveHud.editor.redo')} (Ctrl+Y)`} aria-label={t('liveHud.editor.redo')} disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Dropdown
          align="right"
          open={menu === 'tables'}
          onClose={close}
          trigger={
            <button type="button" aria-haspopup="dialog" aria-expanded={menu === 'tables'} className={buttonClass(menu === 'tables')} onClick={() => setMenu(menu === 'tables' ? null : 'tables')}>
              {t('liveHud.live.show_tables')}
              {toAssociate > 0 && <span className="rounded-lg bg-primary-500 px-1.5 text-[11px] font-bold text-onprimary">{t('liveHud.ws.to_associate', { count: toAssociate })}</span>}
            </button>
          }
        >
          <TablesPanel {...tables} />
        </Dropdown>
      </div>
    </div>
  )
}
