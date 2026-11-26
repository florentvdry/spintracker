import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import { ipcService } from '@/services/ipcService'
import { formatCurrency } from '@/utils/formatters'
import { logError } from '@/utils/log'
import { totalFees, totalRakeback, type RoomRakeback } from '@/utils/rakeback'

/** Rakeback received over all tournaments, from the percentages set in Settings. Not period-filtered. */
export default function RakebackCard() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<RoomRakeback[] | null>(null)

  useEffect(() => {
    let active = true
    ipcService
      .getRakeback()
      .then((result) => {
        if (active && result.success) setRows(result.data as RoomRakeback[])
      })
      .catch((error: unknown) => logError('rakeback fetch failed', error))
    return () => {
      active = false
    }
  }, [])

  const configured = rows?.some((row) => row.percent > 0) ?? false

  return (
    <Card title={t('rakeback.title')} subtitle={t('rakeback.all_time')}>
      {rows === null ? null : (
        <div className="space-y-2">
          <div className="font-mono text-3xl font-semibold text-profit-positive">{formatCurrency(totalRakeback(rows))}</div>
          <div className="text-xs text-gray-500">
            {t('rakeback.fees')} <span className="font-mono">{formatCurrency(totalFees(rows))}</span>
          </div>
          {configured ? (
            rows.map((row) => (
              <div key={row.room} className="flex justify-between text-sm text-gray-300">
                <span>
                  {row.room} <span className="text-xs text-gray-500">({row.percent} %)</span>
                </span>
                <span className="font-mono">{formatCurrency(row.rakeback)}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-500">{t('rakeback.hint')}</p>
          )}
        </div>
      )}
    </Card>
  )
}
