import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  title: string
}

interface State {
  error: Error | null
}

export default class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`PanelErrorBoundary(${this.props.title})`, error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-4">
          <div className="surface-card w-full max-w-sm p-5 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{this.props.title}</p>
            <p className="mt-3 text-sm text-gray-300">{this.state.error.message}</p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
