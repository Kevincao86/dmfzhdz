import { RefreshCw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '../../cn'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

type Props = {
  /** 已绑定后才应挂载并传入 true */
  bound: boolean
  lastSyncAt: string | null
  isRefreshing: boolean
  onManualRefresh: () => void | Promise<void>
  /** 定时触发；未传则与手动刷新相同 */
  onAutoRefresh?: () => void | Promise<void>
  autoRefreshEnabled: boolean
  onAutoRefreshEnabledChange: (enabled: boolean) => void
}

/**
 * 绑定成功后的同步设置：手动刷新 + 每 2 小时自动刷新（页签保持打开时由定时器触发）。
 */
export function MerchantSyncControls({
  bound,
  lastSyncAt,
  isRefreshing,
  onManualRefresh,
  onAutoRefresh,
  autoRefreshEnabled,
  onAutoRefreshEnabledChange,
}: Props) {
  const onManualRef = useRef(onManualRefresh)
  onManualRef.current = onManualRefresh
  const onAutoRef = useRef(onAutoRefresh ?? onManualRefresh)
  onAutoRef.current = onAutoRefresh ?? onManualRefresh

  useEffect(() => {
    if (!bound || !autoRefreshEnabled) return
    const id = window.setInterval(() => {
      void onAutoRef.current()
    }, TWO_HOURS_MS)
    return () => window.clearInterval(id)
  }, [bound, autoRefreshEnabled])

  if (!bound) return null

  return (
    <div className="mt-4 border-t border-green-200/80 pt-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-green-800/80">
        数据同步
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isRefreshing}
            onClick={() => void onManualRefresh()}
            className="inline-flex items-center rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-900 shadow-sm hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')}
            />
            {isRefreshing ? '刷新中…' : '手动刷新'}
          </button>
          <p className="text-xs text-green-800/90">
            上次同步：{lastSyncAt ?? '—'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <label className="flex cursor-pointer items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={autoRefreshEnabled}
              onClick={() => onAutoRefreshEnabledChange(!autoRefreshEnabled)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                autoRefreshEnabled ? 'bg-blue-600' : 'bg-gray-300',
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                  autoRefreshEnabled ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
            <span className="text-sm text-gray-800">自动刷新</span>
          </label>
          <p className="max-w-md text-xs leading-relaxed text-gray-600 sm:text-right">
            开启后，系统每 <strong className="text-gray-800">2 小时</strong>
            自动拉取一次；定时在页面打开期间运行，关闭页签后以下次打开并仍开启本选项时继续计时。
          </p>
        </div>
      </div>
    </div>
  )
}
