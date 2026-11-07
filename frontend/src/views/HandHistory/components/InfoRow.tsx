import type { ReactNode } from 'react'

interface InfoRowProps {
  label: string
  value?: string | number | null
  children?: ReactNode
}

export default function InfoRow({ label, value, children }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-dark-200">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-100">
        {children}
        {value}
      </span>
    </div>
  )
}
