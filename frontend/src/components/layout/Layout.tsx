import type { ReactNode } from 'react'
import Header from './Header'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto bg-dark-500 px-5 pt-5 pb-10">
        <div className="mx-auto max-w-[1440px] animate-fade-in">{children}</div>
      </main>
    </div>
  )
}
