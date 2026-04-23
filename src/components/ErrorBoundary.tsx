import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-base)', color: 'var(--error)' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: 'var(--text-dimmer)', fontSize: '14px' }}>{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="tbtn tbtn-primary"
            style={{ marginTop: '16px', padding: '8px 16px' }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
