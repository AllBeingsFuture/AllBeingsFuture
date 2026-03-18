import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('RootErrorBoundary caught an error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-dark-bg px-6 text-center text-gray-200">
          <div className="surface-card max-w-lg space-y-3 p-8">
            <p className="text-xs uppercase tracking-[0.28em] text-gray-500">AllBeingsFuture</p>
            <h1 className="text-xl font-semibold">界面加载失败</h1>
            <p className="text-sm text-gray-400">{this.state.error.message}</p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
