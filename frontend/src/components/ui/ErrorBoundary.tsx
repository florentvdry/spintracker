import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { logError } from '@/utils/log'

interface BoundaryProps {
  title: string
  retryLabel: string
  /** Changing this value (e.g. the route) clears a previous error. */
  resetKey?: string
  children: ReactNode
}

interface BoundaryState {
  error: Error | null
  resetKey?: string
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError(`View crashed in:${info.componentStack}`, error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-gray-400">
        <p className="text-lg font-medium text-gray-200">{this.props.title}</p>
        <p className="text-sm max-w-md break-words">{this.state.error.message}</p>
        <button className="btn-secondary" onClick={() => this.setState({ error: null })}>{this.props.retryLabel}</button>
      </div>
    )
  }
}

/** Keeps a crash in one view from blanking the whole application. */
export default function ErrorBoundary({ resetKey, children }: { resetKey?: string; children: ReactNode }) {
  const { t } = useTranslation()
  return <Boundary title={t('common.error')} retryLabel={t('common.retry')} resetKey={resetKey}>{children}</Boundary>
}
