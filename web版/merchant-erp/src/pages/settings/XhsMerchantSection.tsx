import { Eye, EyeOff, User } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  postMerchantPlatformSync,
  postXhsBind,
} from '../../services/merchantPlatformApi'
import { XhsApiSection } from './apiDocsContent'
import { MerchantSyncControls } from './MerchantSyncControls'

const TOKEN_KEY = 'meoo_xhs_merchant_token'
const AUTO_KEY = 'meoo_xhs_auto_refresh'
const META_APP_ID = 'meoo_xhs_app_id'

function readSession(key: string) {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeSession(key: string, value: string | null) {
  try {
    if (value == null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export default function XhsMerchantSection() {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    readSession(TOKEN_KEY),
  )
  const [autoRefresh, setAutoRefresh] = useState(() => readSession(AUTO_KEY) !== '0')
  const [bindOpen, setBindOpen] = useState(false)
  const [appId, setAppId] = useState(() => readSession(META_APP_ID) ?? '')
  const [appSecret, setAppSecret] = useState('')
  const [extraId, setExtraId] = useState('')
  const [bindSubmitting, setBindSubmitting] = useState(false)
  const [bindError, setBindError] = useState<string | null>(null)
  const [secretMasked, setSecretMasked] = useState(true)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!bindOpen) setSecretMasked(true)
  }, [bindOpen])

  const persistAuto = (v: boolean) => {
    writeSession(AUTO_KEY, v ? '1' : '0')
    setAutoRefresh(v)
  }

  const runSync = useCallback(async () => {
    const token = readSession(TOKEN_KEY)
    if (!token) return
    setSyncing(true)
    setSyncError(null)
    const r = await postMerchantPlatformSync('xhs', token)
    setSyncing(false)
    if (!r.ok) {
      setSyncError(r.message)
      return
    }
    setLastSyncAt(r.syncedAt ?? new Date().toLocaleString('zh-CN'))
  }, [])

  const handleBind = async () => {
    setBindError(null)
    if (!appId.trim() || !appSecret.trim()) {
      setBindError('请填写 AppID 与 App Secret')
      return
    }
    setBindSubmitting(true)
    const r = await postXhsBind({
      appId: appId.trim(),
      appSecret: appSecret.trim(),
      extraId: extraId.trim() || undefined,
    })
    setBindSubmitting(false)
    if (!r.ok) {
      setBindError(r.message)
      return
    }
    writeSession(TOKEN_KEY, r.accessToken)
    writeSession(META_APP_ID, appId.trim())
    setAccessToken(r.accessToken)
    setAppSecret('')
    setBindOpen(false)
    void runSync()
  }

  const disconnect = () => {
    writeSession(TOKEN_KEY, null)
    setAccessToken(null)
    setLastSyncAt(null)
    setSyncError(null)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start">
          <div className="mr-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-100">
            <i className="fa-solid fa-book text-xl text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">小红书商家版</h3>
            <p className="text-sm text-gray-500">
              绑定开放平台应用后，可手动或每 2 小时自动触发后端同步（商品、消息回调等）
            </p>
          </div>
        </div>
        {!accessToken ? (
          <button
            type="button"
            onClick={() => {
              setBindError(null)
              setBindOpen(true)
            }}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            绑定小红书
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setBindOpen(true)}
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            重新绑定
          </button>
        )}
      </div>

      {accessToken ? (
        <div className="space-y-6">
          <div className="rounded-lg border border-green-200 bg-green-50 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center">
                <div className="mr-4 flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <User className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">小红书开放平台已绑定</h4>
                  <p className="text-sm text-gray-500">
                    AppID：{readSession(META_APP_ID) ?? '—'}
                  </p>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={disconnect}
                      className="text-xs text-red-600 underline hover:text-red-800"
                    >
                      断开连接
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {syncError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {syncError}
              </div>
            )}
            <MerchantSyncControls
              bound
              lastSyncAt={lastSyncAt}
              isRefreshing={syncing}
              onManualRefresh={runSync}
              autoRefreshEnabled={autoRefresh}
              onAutoRefreshEnabledChange={persistAuto}
            />
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-5">
            <h4 className="mb-1 text-sm font-semibold text-gray-900">API 接口设置通道</h4>
            <p className="mb-4 text-xs text-gray-600">
              需在 open.xiaohongshu.com 创建应用并申请「商品管理」等权限后调用。
            </p>
            <XhsApiSection />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-8 text-center text-sm text-gray-600">
          尚未绑定。请点击右上角「绑定小红书」，绑定成功后可使用手动刷新与每 2 小时自动刷新。
        </div>
      )}

      {bindOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !bindSubmitting && setBindOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">绑定小红书</h3>
              <button
                type="button"
                disabled={bindSubmitting}
                onClick={() => setBindOpen(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                aria-label="关闭"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  AppID
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  App Secret
                </label>
                <div className="relative">
                  <input
                    type={secretMasked ? 'password' : 'text'}
                    autoComplete="new-password"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setSecretMasked((m) => !m)}
                    className="absolute right-1 top-1/2 flex h-8 w-9 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    aria-label={secretMasked ? '显示密钥' : '隐藏密钥'}
                  >
                    {secretMasked ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  扩展标识（可选）
                </label>
                <input
                  type="text"
                  value={extraId}
                  onChange={(e) => setExtraId(e.target.value)}
                  placeholder="如 sellerId，由后端按业务使用"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {bindError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {bindError}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={bindSubmitting}
                onClick={() => setBindOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={bindSubmitting}
                onClick={() => void handleBind()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {bindSubmitting ? '绑定中…' : '确认绑定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
