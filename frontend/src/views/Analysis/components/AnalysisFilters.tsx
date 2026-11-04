import { useTranslation } from 'react-i18next'
import type { Json } from '@/services/ipcService'

export const EMPTY_ANALYSIS_FILTERS = {
  Situation: '',
  Action: '',
  PlayerCount: null as number | null,
  MinStackBB: null as number | null,
  MaxStackBB: null as number | null,
  Positions: [] as string[],
  PreflopBtnAction: '',
  PreflopSbAction: '',
  PreflopBbAction: '',
  FlopBtnAction: '',
  FlopSbAction: '',
  FlopBbAction: '',
  TurnBtnAction: '',
  TurnSbAction: '',
  TurnBbAction: '',
  RiverBtnAction: '',
  RiverSbAction: '',
  RiverBbAction: '',
}

export type AnalysisFiltersValue = typeof EMPTY_ANALYSIS_FILTERS

interface AnalysisFiltersProps {
  filters: Json
  onChange: (updates: Partial<AnalysisFiltersValue>) => void
}

const fieldLabel = 'text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1'
const fieldControl = 'w-full bg-dark-400 border border-white/5 rounded-lg px-3 py-2 text-sm text-white'

function StepHeader({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-[10px] font-bold text-white">{step}</div>
      <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">{title}</h3>
    </div>
  )
}

export default function AnalysisFilters({ filters, onChange }: AnalysisFiltersProps) {
  const { t } = useTranslation()

  return (
    <div className="bg-dark-200 rounded-lg p-5 shadow-2xl flex flex-col gap-6 border border-white/5">
      <div className="flex flex-col gap-4">
        <StepHeader step={1} title={t('analysis.filters.situation')} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLabel}>{t('analysis.filters.table_size')}</label>
            <select
              value={filters.PlayerCount || ''}
              onChange={(e) => onChange({ PlayerCount: e.target.value ? parseInt(e.target.value, 10) : null })}
              className={`${fieldControl} mt-1`}
            >
              <option value="">{t('common.any')}</option>
              <option value="2">Heads-Up</option>
              <option value="3">3-Max</option>
            </select>
          </div>

          <div>
            <label className={fieldLabel}>{t('analysis.filters.position')}</label>
            <select
              value={filters.Positions?.[0] || ''}
              onChange={(e) => onChange({ Positions: e.target.value ? [e.target.value] : [] })}
              className={`${fieldControl} mt-1`}
            >
              <option value="">{t('common.any')}</option>
              <option value="BTN">BTN</option>
              <option value="SB">SB</option>
              <option value="BB">BB</option>
            </select>
          </div>
        </div>

        <div>
          <label className={fieldLabel}>{t('analysis.filters.stack_depth')}</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              value={filters.MinStackBB ?? ''}
              onChange={(e) => onChange({ MinStackBB: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="Min"
              className={`flex-1 ${fieldControl}`}
            />
            <span className="text-gray-500">→</span>
            <input
              type="number"
              value={filters.MaxStackBB ?? ''}
              onChange={(e) => onChange({ MaxStackBB: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="Max"
              className={`flex-1 ${fieldControl}`}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-4 border-t border-white/5">
        <StepHeader step={2} title={t('analysis.filters.action')} />
        <div>
          <label className={fieldLabel}>{t('analysis.filters.preflop')}</label>
          <select value={filters.Action || ''} onChange={(e) => onChange({ Action: e.target.value })} className={`${fieldControl} mt-1`}>
            <option value="">{t('common.any')}</option>
            <option value="raise">{t('actions.raise')}</option>
            <option value="call">{t('actions.call')}</option>
            <option value="fold">{t('actions.fold')}</option>
            <option value="check">{t('actions.check')}</option>
            <option value="all_in">{t('actions.allin')}</option>
          </select>
        </div>
      </div>

      <button onClick={() => onChange(EMPTY_ANALYSIS_FILTERS)} className="w-full py-2 text-xs text-gray-500 hover:text-white transition-colors">
        {t('common.clear_all')}
      </button>
    </div>
  )
}
