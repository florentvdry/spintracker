import type { ReactNode } from 'react'
import TopNav from './TopNav'
import Header from './Header'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav />
      <Header />
      <main className="flex-1 overflow-y-auto bg-dark-500 px-5 py-4">
        <div className="mx-auto animate-fade-in">{children}</div>
      </main>
    </div>
  )
}
