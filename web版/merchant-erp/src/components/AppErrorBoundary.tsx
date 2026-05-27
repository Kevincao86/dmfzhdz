import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** 避免单个子树异常导致整页白屏或仅显示 Vite 红屏时无中文说明 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900">灵祺 ERP 页面异常</h1>
          <p className="max-w-lg text-sm text-gray-600">
            页面加载时出现异常，可尝试硬刷新浏览器（Windows：Ctrl+Shift+R，Mac：Cmd+Shift+R）或稍后重试。开发环境若在更新代码或依赖后出现本页，可由技术人员查看下方错误信息并重载。
          </p>
          <pre className="max-h-[40vh] max-w-2xl overflow-auto rounded-lg border border-red-100 bg-white p-4 text-left text-xs text-red-800 shadow-sm">
            {error.stack ?? error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
