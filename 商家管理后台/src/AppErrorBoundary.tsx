import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[OpsAdmin]', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center text-slate-100">
          <h1 className="text-xl font-semibold text-white">运营管控台加载异常</h1>
          <p className="max-w-lg text-sm text-slate-400">
            请尝试硬刷新（Mac：Cmd+Shift+R）。若刚改过依赖或 Node 版本，请重启{' '}
            <code className="rounded bg-slate-800 px-1 text-cyan-300">npm run dev</code>。
          </p>
          <pre className="max-h-[40vh] max-w-2xl overflow-auto rounded-lg border border-red-900/50 bg-slate-900 p-4 text-left text-xs text-red-300">
            {error.stack ?? error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
