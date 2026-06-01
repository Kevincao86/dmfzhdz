import { BookOpen, ExternalLink } from 'lucide-react'
import SecretInput from '../../components/SecretInput'
import { useCallback, useState } from 'react'
import {
  getMerchantPlatform,
  type MerchantPlatformId,
} from '../../constants/merchantPlatforms'
import { merchantPlatformLogoKey, PlatformBrandLogo } from '../../lib/platformBranding'
import { postWaimaiBind, postWaimaiSync } from '../../services/merchantPlatformApi'
import BindGuideModal from './bindGuide/BindGuideModal'
import { MerchantSyncControls } from './MerchantSyncControls'

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

type Props = {
  platformId: Extract<MerchantPlatformId, 'eleme' | 'meituan_waimai' | 'jd_waimai'>
  guideSteps: { title: string; body: string }[]
}

export default function WaimaiMerchantSection({ platformId, guideSteps }: Props) {
  const meta = getMerchantPlatform(platformId)
  const logoKey = merchantPlatformLogoKey(platformId)
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    readSession(meta.tokenSessionKey),
  )
  const [autoRefresh, setAutoRefresh] = useState(
    () => readSession(`${meta.tokenSessionKey}_auto`) !== '0',
  )
  const [bindOpen, setBindOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [appId, setAppId] = useState(() => readSession(meta.appIdSessionKey) ?? '')
  const [appSecret, setAppSecret] = useState('')
  const [extraId, setExtraId] = useState('')
  const [bindSubmitting, setBindSubmitting] = useState(false)
  const [bindError, setBindError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const persistAuto = (v: boolean) => {
    writeSession(`${meta.tokenSessionKey}_auto`, v ? '1' : '0')
    setAutoRefresh(v)
  }

  const runSync = useCallback(async () => {
    const token = readSession(meta.tokenSessionKey)
    if (!token) return
    setSyncing(true)
    setSyncError(null)
    const r = await postWaimaiSync(platformId, token)
    setSyncing(false)
    if (!r.ok) {
      setSyncError(r.message)
      return
    }
    setLastSyncAt(r.syncedAt ?? new Date().toLocaleString('zh-CN'))
  }, [meta.tokenSessionKey, platformId])

  const handleBind = async () => {
    setBindError(null)
    if (!appId.trim() || !appSecret.trim()) {
      setBindError('请填写商家自研应用的 AppID 与 App Secret')
      return
    }
    setBindSubmitting(true)
    const r = await postWaimaiBind(platformId, {
      appId: appId.trim(),
      appSecret: appSecret.trim(),
      extraId: extraId.trim() || undefined,
    })
    setBindSubmitting(false)
    if (!r.ok) {
      setBindError(r.message)
      return
    }
    writeSession(meta.tokenSessionKey, r.accessToken)
    writeSession(meta.appIdSessionKey, appId.trim())
    setAccessToken(r.accessToken)
    setAppSecret('')
    setBindOpen(false)
    void runSync()
  }

  const disconnect = () => {
    writeSession(meta.tokenSessionKey, null)
    setAccessToken(null)
    setLastSyncAt(null)
    setSyncError(null)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start">
          {logoKey ? (
            <PlatformBrandLogo logo={logoKey} alt={meta.name} size="lg" className="mr-4" />
          ) : null}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{meta.name}</h3>
            <p className="text-sm text-gray-500">
              商家自研系统接入：绑定后可在商品、门店、评价、活动与财务对账中按
              {meta.name}模板创建与同步数据。
            </p>
            <a
              href={meta.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              开放平台文档
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <BookOpen className="h-4 w-4" />
            接入指南
          </button>
          {accessToken ? (
            <>
              <button
                type="button"
                onClick={() => void runSync()}
                disabled={syncing}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {syncing ? '同步中…' : '立即同步'}
              </button>
              <button
                type="button"
                onClick={disconnect}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
              >
                解除绑定
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setBindOpen(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              绑定 {meta.name}
            </button>
          )}
        </div>
      </div>

      {accessToken ? (
        <div className="space-y-2">
          {syncError ? <p className="text-sm text-red-600">{syncError}</p> : null}
          <MerchantSyncControls
            bound
            lastSyncAt={lastSyncAt}
            isRefreshing={syncing}
            onManualRefresh={runSync}
            autoRefreshEnabled={autoRefresh}
            onAutoRefreshEnabledChange={persistAuto}
          />
        </div>
      ) : null}

      {bindOpen ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-5">
          <h4 className="mb-3 font-medium text-gray-900">绑定凭据（仅存于当前浏览器会话）</h4>
          {bindError ? (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{bindError}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-gray-600">AppID / App Key</span>
              <input
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">App Secret</span>
              <div className="relative mt-1">
                <SecretInput
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  autoComplete="new-password"
                />
              </div>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-gray-600">商户号 / 开发者 ID（选填）</span>
              <input
                value={extraId}
                onChange={(e) => setExtraId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={bindSubmitting}
              onClick={() => void handleBind()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {bindSubmitting ? '绑定中…' : '确认绑定'}
            </button>
            <button
              type="button"
              onClick={() => setBindOpen(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <BindGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} title={`${meta.name} 商家自研接入`}>
        <ol className="list-decimal space-y-4 pl-5 text-sm text-gray-700">
          {guideSteps.map((s) => (
            <li key={s.title}>
              <p className="font-medium text-gray-900">{s.title}</p>
              <p className="mt-1 leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </BindGuideModal>
    </div>
  )
}
