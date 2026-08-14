import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Label } from './ui'

/**
 * Route-level error boundary (CLAUDE.md §9). One bad aggregation must not blank
 * the whole app — the nav stays, and the user can navigate away.
 *
 * Deliberately a class: React still has no hook equivalent for componentDidCatch.
 */
export class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route error:', error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <section className="flex flex-col gap-4 py-16" role="alert">
        <Label>Something broke on this page</Label>
        <h1 className="m-0 text-2xl font-semibold text-ink-0">
          This view failed to render.
        </h1>
        <p className="m-0 max-w-prose text-ink-1">
          The rest of the app still works — use the navigation to go somewhere else. The
          error is in the browser console.
        </p>
        <pre className="m-0 overflow-x-auto rounded-sm border border-rule p-3 font-mono text-xs text-ink-2">
          {error.message}
        </pre>
      </section>
    )
  }
}
