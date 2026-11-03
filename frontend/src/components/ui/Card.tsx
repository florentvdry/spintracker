import type { CSSProperties, ReactNode } from 'react'
import clsx from 'clsx'

interface CardProps {
  title?: string
  subtitle?: string
  flat?: boolean
  padding?: 'default' | 'none'
  header?: ReactNode
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export default function Card({ title, subtitle, flat, padding = 'default', header, className, style, children }: CardProps) {
  return (
    <div className={clsx('card', flat && 'card-flat', padding === 'none' && 'p-0', className)} style={style}>
      {(title || header) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            {title && <h3 className="section-label">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {header}
        </div>
      )}
      {children}
    </div>
  )
}
