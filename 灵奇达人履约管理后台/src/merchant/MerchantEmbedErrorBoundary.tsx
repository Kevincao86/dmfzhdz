import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = { error: Error | null }

/** 商家页嵌入失败时避免整站黑屏 */
export default class MerchantEmbedErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[merchant-embed]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message || ''
      const isChunkLoad =
        /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(msg)
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-slate-800">
          <h2 className="text-lg font-bold text-red-800">增值服务页加载失败</h2>
          <p className="mt-2 text-sm text-red-700">{msg || '未知错误'}</p>
          <p className="mt-3 text-xs text-slate-600">
            {isChunkLoad
              ? '检测到前端资源版本不一致（常见于刚发版后）。请点击下方按钮刷新页面加载最新资源。'
              : '请刷新页面；若仍失败，请确认已部署最新前端（修复 React 双实例问题）。'}
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white"
            onClick={() => {
              if (isChunkLoad) {
                window.location.reload()
                return
              }
              this.setState({ error: null })
            }}
          >
            {isChunkLoad ? '刷新页面' : '重试'}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
