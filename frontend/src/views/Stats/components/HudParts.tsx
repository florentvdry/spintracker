import clsx from 'clsx'
import type { CSSProperties } from 'react'
import type { Json } from '@/services/ipcService'
import { hasSampleHands, hudTone, hudTooltip, hudValue } from '../hudModel'

/** Opens the list of hands behind a stat value. */
export type OpenHands = (label: string, value: Json, context: string) => void

/** A stat value that opens its hands when clicked (if it has any). */
function StatValue({
  label, value, context, className, onOpen,
}: { label: string; value: Json; context: string; className?: string; onOpen: OpenHands }) {
  const clickable = hasSampleHands(value)
  return (
    <b
      className={clsx(className, hudTone(label, value), clickable && 'has-hand-samples')}
      title={hudTooltip(label, value)}
      onClick={clickable ? () => onOpen(label, value, context) : undefined}
    >
      {hudValue(value)}
    </b>
  )
}

interface HudMiniTableProps {
  title: string
  headers: string[]
  rows: { label: string; values: Json[]; tone?: string }[]
  colorful?: boolean
  onOpen: OpenHands
}

export function HudMiniTable({ title, headers, rows, colorful, onOpen }: HudMiniTableProps) {
  const cols = { '--hud-mini-cols': headers.length } as CSSProperties
  return (
    <div className="hud-mini-table">
      <div className="hud-mini-title" style={cols}>
        <span title={hudTooltip(title)}>{title}</span>
        {headers.map((header) => <strong key={header} title={hudTooltip(header)}>{header}</strong>)}
      </div>
      <div className="hud-mini-body">
        {rows.map((row) => (
          <div key={row.label} className={clsx('hud-mini-row', row.tone)} style={cols}>
            <span className={colorful ? row.tone : ''} title={hudTooltip(row.label)}>{row.label}</span>
            {row.values.map((value, idx) => {
              const key = row.label === 'Total' ? title : row.label
              const toneKey = title.includes('vs') ? headers[idx] : key
              return (
                <StatValue key={idx} label={toneKey} value={value} context={`${title} / ${headers[idx]}`} onOpen={onOpen} />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function HudStatLine({ row, onOpen }: { row: Json; onOpen: OpenHands }) {
  return (
    <div className="hud-stat-line">
      <span title={hudTooltip(row.label)}>{row.label}</span>
      <StatValue label={row.label} value={row.threeMax} context="3-max" onOpen={onOpen} />
      <StatValue label={row.label} value={row.huSb} context="HU SB" className="sb" onOpen={onOpen} />
      <StatValue label={row.label} value={row.huBb} context="HU BB" className="bb" onOpen={onOpen} />
    </div>
  )
}

export function HudMatrix({ headers, rows, onOpen }: { headers: string[]; rows: Json[][]; onOpen: OpenHands }) {
  return (
    <div className="hud-matrix-wrap">
      <table className="hud-matrix">
        <thead>
          <tr>
            {headers.map((header, idx) => <th key={header} className={idx === 0 ? 'left' : ''} title={hudTooltip(header)}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])}>
              {r.map((cell, idx) => {
                if (idx === 0) return <td key={idx} className="left stack">{cell || '--'}</td>
                const clickable = hasSampleHands(cell)
                return (
                  <td
                    key={idx}
                    className={clsx(hudTone(headers[idx], cell), clickable && 'has-hand-samples')}
                    title={hudTooltip(headers[idx], cell)}
                    onClick={clickable ? () => onOpen(headers[idx], cell, String(r[0])) : undefined}
                  >
                    {hudValue(cell)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function HudPostflopBox({ box, onOpen }: { box: Json; onOpen: OpenHands }) {
  return (
    <div className="hud-postflop-box">
      <div className="hud-box-title">{box.title}</div>
      {box.sections.map((section: Json) => {
        const cols = { '--hud-box-cols': section.headers.length } as CSSProperties
        return (
          <div key={section.title} className="hud-box-section">
            <div className="hud-box-section-head" style={cols}>
              <span title={hudTooltip(section.title)}>{section.title}</span>
              {section.headers.map((header: string) => <strong key={header} title={hudTooltip(header)}>{header}</strong>)}
            </div>
            {section.rows.map((row: Json[]) => (
              <div key={String(row[0])} className="hud-box-row" style={cols}>
                <span title={hudTooltip(row[0] as string)}>{row[0]}</span>
                {row.slice(1).map((value, idx) => (
                  <StatValue
                    key={idx}
                    label={row[0] as string}
                    value={value}
                    context={`${box.title} / ${section.title} / ${section.headers[idx]}`}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
