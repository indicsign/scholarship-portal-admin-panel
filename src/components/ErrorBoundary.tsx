import { Component, type ReactNode } from 'react'

/* The last line between one broken screen and a blank panel.
 *
 * React unmounts the whole root when a render throws and nothing catches it, so
 * without this a single bad field on a single page takes the sidebar, the
 * masthead and every other screen with it — and leaves the operator staring at
 * white, with no way back that is not a reload. That is the worst failure this
 * panel has: it looks like the platform is down.
 *
 * Deliberately a class. Error boundaries have no hook equivalent; this is the
 * one place the old API is still the only API.
 *
 * It catches render errors only — not an event handler, not a rejected promise
 * in useQuery. Those already have somewhere to go, which is why the screens
 * report a failed request through ErrorState rather than throwing.
 */

interface Props {
  children: ReactNode
  // Changing this remounts the boundary, which is how navigating away from a
  // broken screen clears it. Without it the error sticks to the frame and
  // every subsequent page renders the fallback instead.
  resetKey?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error) {
    // Console rather than a reporting service: there is no error pipeline in
    // this panel yet, and swallowing it silently would make the fallback below
    // the only evidence that anything happened.
    console.error('screen failed to render', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <>
        <div className="page-head"><h1>This screen could not be shown</h1></div>
        <div className="alert danger" role="alert">
          <p>
            Something in this page failed while it was being drawn. The rest of
            the panel is unaffected — choose another screen from the menu, or
            try this one again.
          </p>
          <p className="mono" style={{ fontSize: 12 }}>{this.state.error.message}</p>
          <p>
            <button className="sm" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </p>
        </div>
      </>
    )
  }
}
