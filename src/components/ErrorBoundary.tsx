import { Component, type ReactNode } from 'react'

/** Last-resort screen so a crash never leaves a blank white page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-court-900/5">
          <p className="text-xl font-bold">Something went wrong</p>
          <p className="mt-2 text-sm break-words text-court-800/80">{this.state.error.message}</p>
          <button
            className="mt-5 h-12 w-full rounded-xl bg-ball-400 font-semibold text-court-900"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
