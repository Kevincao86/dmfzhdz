import { BookOpen, User } from 'lucide-react'
import SecretInput from '../../components/SecretInput'
import { useCallback, useState } from 'react'
import {
  postMeituanBind,
  postMerchantPlatformSync,
} from '../../services/merchantPlatformApi'
import { PlatformBrandLogo } from '../../lib/platformBranding'
import BindGuideModal from './bindGuide/BindGuideModal'
import PlatformBindGuide from './bindGuide/PlatformBindGuide'
import { MEITUAN_BIND_GUIDE } from './bindGuide/meituanBindGuide'
import { MerchantSyncControls } from './MerchantSyncControls'

const TOKEN_KEY = 'meoo_meituan_merchant_token'
const AUTO_KEY = 'meoo_meituan_auto_refresh'
const META_APP_ID = 'meoo_meituan_app_id'
const DEMO_KEY = 'meoo_meituan_bind_demo'

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

export default function MeituanMerchantSection() {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    readSession(TOKEN_KEY),
  )
  const [autoRefresh, setAutoRefresh] = useState(() => readSession(AUTO_KEY) !== '0')
  const [bindOpen, setBindOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [appId, setAppId] = useState(() => readSession(META_APP_ID) ?? '')
  const [appSecret, setAppSecret] = useState('')
  const [appAuthToken, setAppAuthToken] = useState('')
  const [extraId, setExtraId] = useState('')
  const [bindSubmitting, setBindSubmitting] = useState(false)
  const [bindError, setBindError] = useState<string | null>(null)
  const [bindHint, setBindHint] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [demoBound, setDemoBound] = useState(() => readSession(DEMO_KEY) === '1')

  const persistAuto = (v: boolean) => {
    writeSession(AUTO_KEY, v ? '1' : '0')
    setAutoRefresh(v)
  }

  const runSync = useCallback(async () => {
    const token = readSession(TOKEN_KEY)
    if (!token) return
    setSyncing(true)
    setSyncError(null)
    const r = await postMerchantPlatformSync('meituan', token)
    setSyncing(false)
    if (!r.ok) {
      setSyncError(r.message)
      return
    }
    setLastSyncAt(r.syncedAt ?? new Date().toLocaleString('zh-CN'))
  }, [])

  const handleBind = async () => {
    setBindError(null)
    setBindHint(null)
    if (!appId.trim() || !appSecret.trim()) {
      setBindError('请填写商家自研应用的 AppID / developerId 与 App Secret / SignKey')
      return
    }
    setBindSubmitting(true)
    const r = await postMeituanBind({
      appId: appId.trim(),
      appSecret: appSecret.trim(),
      appAuthToken: appAuthToken.trim() || undefined,
      extraId: extraId.trim() || undefined,
    })
    setBindSubmitting(false)
    if (!r.ok) {
      setBindError(r.message)
      return
    }
    writeSession(TOKEN_KEY, r.accessToken)
    writeSession(META_APP_ID, appId.trim())
    writeSession(DEMO_KEY, r.demo ? '1' : '0')
    setDemoBound(Boolean(r.demo))
    setAccessToken(r.accessToken)
    setAppSecret('')
    setAppAuthToken('')
    setBindOpen(false)
    if (r.message) setBindHint(r.message)
    void runSync()
  }

  const disconnect = () => {
    writeSession(TOKEN_KEY, null)
    writeSession(DEMO_KEY, null)
    setAccessToken(null)
    setDemoBound(false)
    setLastSyncAt(null)
    setSyncError(null)
    setBindHint(null)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start">
          <PlatformBrandLogo logo="dianping" alt="大众点评" size="lg" className="mr-4" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">大众点评商家版</h3>
            <p className="text-sm text-gray-500">
              商家自研接入：绑定后可同步门店、团购商品、评价与财务等经营数据；支持手动或定时刷新。
            </p>
            <p className="mt-1 text-xs text-gray-400">接入模式：商家自研（非三方服务商）</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <BookOpen className="h-4 w-4" />
            绑定说明书
          </button>
          {!accessToken ? (
            <button
              type="button"
              onClick={() => {
                setBindError(null)
                setBindOpen(true)
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              绑定大众点评
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setBindOpen(true)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              重新绑定
            </button>
          )}
        </div>
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
                  <h4 className="font-medium text-gray-900">大众点评已绑定</h4>
                  <p className="text-sm text-gray-500">
                    应用编号：{readSession(META_APP_ID) ?? '—'} · 接入模式：商家自研
                    {demoBound ? ' · 演示模式' : ''}
                  </p>
                  {bindHint ? (
                    <p className="mt-1 text-xs text-amber-700">{bindHint}</p>
                  ) : null}
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
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-8 text-center text-sm text-gray-600">
          尚未绑定。请先阅读
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="mx-1 text-blue-600 underline hover:text-blue-800"
          >
            绑定说明书
          </button>
          （商家自研流程），再点击「绑定大众点评」完成授权。
        </div>
      )}

      <BindGuideModal
        open={guideOpen}
        title="大众点评商家版绑定说明书（商家自研）"
        onClose={() => setGuideOpen(false)}
        primaryAction={
          !accessToken
            ? {
                label: '去绑定',
                onClick: () => {
                  setGuideOpen(false)
                  setBindError(null)
                  setBindOpen(true)
                },
              }
            : undefined
        }
      >
        <PlatformBindGuide config={MEITUAN_BIND_GUIDE} compact />
      </BindGuideModal>

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
              <div>
                <h3 className="text-lg font-semibold text-gray-900">绑定大众点评</h3>
                <p className="mt-0.5 text-xs text-gray-500">接入模式：商家自研</p>
              </div>
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
                  应用编号（AppID / developerId）
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
                  应用密钥（App Secret / SignKey）
                </label>
                <SecretInput
                  autoComplete="new-password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  商户授权 Token（appAuthToken，选填）
                </label>
                <SecretInput
                  autoComplete="new-password"
                  value={appAuthToken}
                  onChange={(e) => setAppAuthToken(e.target.value)}
                  placeholder="门店授权成功后填写；演示模式可留空"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  门店 / 商户标识（可选）
                </label>
                <input
                  type="text"
                  value={extraId}
                  onChange={(e) => setExtraId(e.target.value)}
                  placeholder="多门店时可填门店编号，单店可留空"
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
