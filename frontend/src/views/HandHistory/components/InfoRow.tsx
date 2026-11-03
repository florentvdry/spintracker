import type { ReactNode } from 'react'

interface InfoRowProps {
  label: string
  value?: string | number | null
  children?: ReactNode
}

export default function InfoRow({ label, value, children }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-dark-100/30">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium">
        {children}
        {value}
      </span>
    </div>
  )
}
