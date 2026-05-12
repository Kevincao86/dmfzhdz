import { Eye, EyeOff, Search, User } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../cn'
import {
  deleteDouyinBindingCloud,
  fetchDouyinBindingCloud,
  upsertDouyinBindingCloud,
} from '../../lib/merchantDouyinCloudBinding'
import {
  readMerchantSession,
  writeMerchantSession,
} from '../../lib/merchantSession'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import {
  getDouyinStores,
  postDouyinBind,
  type DouyinStoreRow,
} from '../../services/douyinMerchantApi'
import { MerchantSyncControls } from './MerchantSyncControls'

const TOKEN_KEY = 'meoo_douyin_merchant_token'
const AUTO_KEY = 'meoo_douyin_auto_refresh'
const META_APP_ID = 'meoo_douyin_app_id'
const META_MERCHANT_ID = 'meoo_douyin_merchant_id'
const META_ACCOUNT_NAME = 'meoo_douyin_account_name'

type PageSize = 10 | 50 | 100

/** 门店列表失败但绑定/会话未必失效：反代 HTML、5xx、超时等 */
function listErrorIndicatesInfrastructure(msg: string): boolean {
  const c = msg ?? ''
  const m = c.toLowerCase()
  if (/<!doctype|<\s*html[\s>]|<html[\s>]/.test(m.slice(0, 400))) return true
  if (/返回.*html|非\s*json|开放平台网页|抖音开放平台/.test(c)) return true
  if (/nginx|反代|proxy_pass|自建反代|502|503|504|网关|fetch failed|econnreset|aborted|中止/i.test(m))
    return true
  if (c.includes('DOUYIN_OPENAPI_BASE_URL') || m.includes('/douyin/')) return true
  if (/超时|timed?\s*out|timeout/i.test(m)) return true
  if (/relation_type.*均失败|三种 relation_type/.test(c)) return true
  return false
}

/** 开放平台明确拒绝或本地解密失败 — 才提示「连接异常」需重绑 */
function listErrorIndicatesInvalidSession(msg: string): boolean {
  if (listErrorIndicatesInfrastructure(msg)) return false
  const c = msg ?? ''
  const m = c.toLowerCase()
  if (/\b401\b|\b403\b/.test(c)) return true
  if (
    /未授权|无权|拒绝访问|token无效|access[_-]?token|会话|解密失败|凭证无效|授权失效|已过期|expired|invalid.*token|鉴权失败/.test(
      m,
    )
  )
    return true
  return false
}

export default function DouyinMerchantSection() {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    readMerchantSession(TOKEN_KEY),
  )
  const [bindOpen, setBindOpen] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(() => readMerchantSession(AUTO_KEY) !== '0')
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  const [appId, setAppId] = useState(() => readMerchantSession(META_APP_ID) ?? '')
  const [appSecret, setAppSecret] = useState('')
  const [merchantId, setMerchantId] = useState(
    () => readMerchantSession(META_MERCHANT_ID) ?? '',
  )
  const [bindSubmitting, setBindSubmitting] = useState(false)
  const [bindError, setBindError] = useState<string | null>(null)
  /** true = 密文；与按钮图标「当前可执行动作」一致：遮罩时显示眼睛=点击显示明文 */
  const [secretMasked, setSecretMasked] = useState(true)
  const [boundMerchantId, setBoundMerchantId] = useState(() => {
    if (readMerchantSession(TOKEN_KEY)) return readMerchantSession(META_MERCHANT_ID) ?? ''
    return ''
  })
  const [boundAccountName, setBoundAccountName] = useState(() => {
    if (readMerchantSession(TOKEN_KEY)) return readMerchantSession(META_ACCOUNT_NAME) ?? ''
    return ''
  })

  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)

  const [rows, setRows] = useState<DouyinStoreRow[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  /** 网关返回的 emptyHint / relationWarnings，便于区分「真无门店」与「部分 relation 失败」 */
  const [storesHint, setStoresHint] = useState<string | null>(null)

  const bindOpenRef = useRef(false)
  /** 绑定成功后会 setAccessToken 并显式 loadStores；避免与下方 useEffect 再叠一次全量 shop.query（易触发抖音限流） */
  const skipNextStoresAutoLoadRef = useRef(false)
  useEffect(() => {
    bindOpenRef.current = bindOpen
  }, [bindOpen])

  /** 登录 Supabase 后：优先从云端恢复绑定；仅有本地时备份到云端（换设备可用） */
  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    const sb = supabase

    const hydrate = async () => {
      const {
        data: { session },
      } = await sb.auth.getSession()
      if (!session?.user) return
      if (bindOpenRef.current) return

      const cloud = await fetchDouyinBindingCloud(sb)
      if (cloud) {
        writeMerchantSession(TOKEN_KEY, cloud.sealed_credentials)
        if (cloud.client_key) writeMerchantSession(META_APP_ID, cloud.client_key)
        if (cloud.merchant_account_id) writeMerchantSession(META_MERCHANT_ID, cloud.merchant_account_id)
        if (cloud.account_display_name) writeMerchantSession(META_ACCOUNT_NAME, cloud.account_display_name)
        else writeMerchantSession(META_ACCOUNT_NAME, null)
        setAccessToken(cloud.sealed_credentials)
        setBoundMerchantId(cloud.merchant_account_id ?? '')
        setBoundAccountName(cloud.account_display_name ?? '')
        setAppId(cloud.client_key ?? '')
        setMerchantId(cloud.merchant_account_id ?? '')
        return
      }

      const localTok = readMerchantSession(TOKEN_KEY)
      const appIdL = readMerchantSession(META_APP_ID)
      const midL = readMerchantSession(META_MERCHANT_ID)
      const accL = readMerchantSession(META_ACCOUNT_NAME)
      if (localTok && appIdL && midL) {
        const up = await upsertDouyinBindingCloud(sb, {
          sealedToken: localTok,
          clientKey: appIdL,
          merchantAccountId: midL,
          accountDisplayName: accL,
        })
        if (up.ok === false) console.warn('[douyin] 本地绑定备份到云端失败:', up.message)
      }
    }

    void hydrate()
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(() => void hydrate())
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedKeyword(keyword.trim()), 350)
    return () => window.clearTimeout(t)
  }, [keyword])

  useEffect(() => {
    setPage(1)
  }, [debouncedKeyword, pageSize])

  useEffect(() => {
    if (accessToken) {
      setBoundMerchantId(readMerchantSession(META_MERCHANT_ID) ?? '')
      setBoundAccountName(readMerchantSession(META_ACCOUNT_NAME) ?? '')
    } else {
      setBoundMerchantId('')
      setBoundAccountName('')
    }
  }, [accessToken])

  useEffect(() => {
    if (!bindOpen) setSecretMasked(true)
  }, [bindOpen])

  const loadStores = useCallback(
    async (opts?: {
      silent?: boolean
      refresh?: boolean
      /** 绑定成功瞬间 state 尚未提交，需显式传入 */
      accessTokenOverride?: string
      merchantIdOverride?: string
    }) => {
      const tok = (opts?.accessTokenOverride ?? accessToken)?.trim()
      if (!tok) {
        setRows([])
        setTotal(0)
        setStoresHint(null)
        return
      }
      const mid =
        opts?.merchantIdOverride?.trim() ||
        boundMerchantId.trim() ||
        readMerchantSession(META_MERCHANT_ID)?.trim() ||
        undefined
      const silent = opts?.silent ?? false
      if (!silent) setListLoading(true)
      if (!silent) setListError(null)
      const res = await getDouyinStores({
        accessToken: tok,
        page,
        pageSize,
        keyword: debouncedKeyword || undefined,
        merchantId: mid,
        relationType: 'all',
        refresh: opts?.refresh,
      })
      if (!silent) setListLoading(false)
      if (res.ok === false) {
        setListError(res.message)
        setStoresHint(null)
        if (!silent) {
          setRows([])
          setTotal(0)
        }
        return
      }
      setListError(null)
      const hintParts: string[] = []
      if (res.relationWarnings?.length) hintParts.push(...res.relationWarnings)
      if (res.emptyHint) hintParts.push(res.emptyHint)
      setStoresHint(hintParts.length ? hintParts.join('\n\n') : null)
      setRows(res.items)
      setTotal(res.total)
      const syncName = res.accountName?.trim()
      if (syncName) {
        setBoundAccountName(syncName)
        writeMerchantSession(META_ACCOUNT_NAME, syncName)
      }
      setLastSyncAt(new Date().toLocaleString('zh-CN'))
    },
    [accessToken, boundMerchantId, page, pageSize, debouncedKeyword],
  )

  const persistAuto = (v: boolean) => {
    writeMerchantSession(AUTO_KEY, v ? '1' : '0')
    setAutoRefresh(v)
  }

  const manualRefresh = useCallback(async () => {
    setManualRefreshing(true)
    try {
      await loadStores({ silent: false, refresh: true })
    } finally {
      setManualRefreshing(false)
    }
  }, [loadStores])

  const autoRefreshRun = useCallback(async () => {
    await loadStores({ silent: true })
  }, [loadStores])

  useEffect(() => {
    if (skipNextStoresAutoLoadRef.current) {
      skipNextStoresAutoLoadRef.current = false
      return
    }
    void loadStores()
  }, [loadStores])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize) || 1),
    [total, pageSize],
  )

  /**
   * 绑定卡片：绿=门店接口正常；琥珀 pending=首屏校验中；琥珀 degraded=网络/反代等门店拉取失败但凭据仍保留；
   * 红 error=疑似会话/鉴权失效（非基础设施类错误）。
   */
  const bindCardTone = useMemo((): 'ok' | 'error' | 'pending' | 'degraded' => {
    if (!accessToken) return 'pending'
    if (listError) {
      if (listErrorIndicatesInfrastructure(listError)) return 'degraded'
      if (listErrorIndicatesInvalidSession(listError)) return 'error'
      return 'degraded'
    }
    // 有凭证即视为已绑定；切页/首屏拉门店时不在顶部卡片显示「正在验证」，避免误以为需重新绑定（加载态见下方表格）
    return 'ok'
  }, [accessToken, listError])

  const bindCardShell = useMemo(() => {
    if (bindCardTone === 'error') {
      return {
        box: 'border-red-200 bg-red-50',
        icon: 'bg-red-100 text-red-600',
        title: '抖音来客连接异常',
        subtitle:
          '开放平台拒绝了当前会话或本地凭证无法解密。请重新绑定；若刚调整过服务端密钥，也需重新绑定。',
      }
    }
    if (bindCardTone === 'degraded') {
      return {
        box: 'border-amber-200 bg-amber-50',
        icon: 'bg-amber-100 text-amber-600',
        title: '抖音来客已绑定（门店同步受阻）',
        subtitle:
          '绑定凭据仍保留，但当前无法稳定拉取门店列表（常见于反代未透传 GET、超时或上游返回网页而非 JSON）。可稍后重试；运维请检查 DOUYIN_OPENAPI_BASE_URL / Nginx。',
      }
    }
    if (bindCardTone === 'pending') {
      return {
        box: 'border-amber-200 bg-amber-50',
        icon: 'bg-amber-100 text-amber-600',
        title: '正在验证连接…',
        subtitle: '正在请求门店接口以确认会话是否有效。',
      }
    }
    return {
      box: 'border-green-200 bg-green-50',
      icon: 'bg-green-100 text-green-600',
      title: '抖音来客已绑定',
      subtitle: null as string | null,
    }
  }, [bindCardTone])

  const clampedPage = useMemo(() => Math.min(page, totalPages), [page, totalPages])

  useEffect(() => {
    if (clampedPage !== page) setPage(clampedPage)
  }, [clampedPage, page])

  const handleBind = async () => {
    setBindError(null)
    if (!appId.trim() || !appSecret.trim() || !merchantId.trim()) {
      setBindError('请填写 AppID、App Secret 与商户 ID')
      return
    }
    setBindSubmitting(true)
    try {
      const r = await postDouyinBind({
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        merchantId: merchantId.trim(),
      })
      if (!r.ok) {
        setBindError(r.message)
        return
      }
      skipNextStoresAutoLoadRef.current = true
      writeMerchantSession(TOKEN_KEY, r.accessToken)
      writeMerchantSession(META_APP_ID, appId.trim())
      writeMerchantSession(META_MERCHANT_ID, merchantId.trim())
      const accName = r.accountName?.trim()
      if (accName) writeMerchantSession(META_ACCOUNT_NAME, accName)
      else writeMerchantSession(META_ACCOUNT_NAME, null)
      setBoundMerchantId(merchantId.trim())
      setBoundAccountName(accName ?? '')
      setAccessToken(r.accessToken)
      if (supabaseConfigured && supabase) {
        const cr = await upsertDouyinBindingCloud(supabase, {
          sealedToken: r.accessToken,
          clientKey: appId.trim(),
          merchantAccountId: merchantId.trim(),
          accountDisplayName: accName ?? null,
        })
        if (cr.ok === false) console.warn('[douyin] 绑定成功后云端同步失败:', cr.message)
      }
      setAppSecret('')
      setBindOpen(false)
      setPage(1)
      await loadStores({
        silent: false,
        refresh: true,
        accessTokenOverride: r.accessToken,
        merchantIdOverride: merchantId.trim(),
      })
    } catch (e) {
      setBindError(e instanceof Error ? e.message : String(e))
    } finally {
      setBindSubmitting(false)
    }
  }

  const disconnect = () => {
    void (async () => {
      try {
        if (supabaseConfigured && supabase) {
          const d = await deleteDouyinBindingCloud(supabase)
          if (d.ok === false) console.warn('[douyin] 云端解绑失败:', d.message)
        }
      } finally {
        writeMerchantSession(TOKEN_KEY, null)
        writeMerchantSession(META_ACCOUNT_NAME, null)
        setBoundMerchantId('')
        setBoundAccountName('')
        setAccessToken(null)
        setRows([])
        setTotal(0)
        setLastSyncAt(null)
        setListError(null)
        setStoresHint(null)
      }
    })()
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start">
          <div className="mr-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pink-100">
            <i className="fa-brands fa-tiktok text-xl text-pink-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">抖音来客商家版</h3>
            <p className="text-sm text-gray-500">
              绑定开放平台凭证后，经后端代理拉取账户下全部门店明细（分页与搜索由接口支持）。
              {supabaseConfigured ? (
                <span className="mt-1 block text-gray-600">
                  已登录商户主账号时，绑定会写入 Supabase（表{' '}
                  <code className="rounded bg-gray-100 px-1 text-xs">tenant_merchant_bindings</code>
                  ）；换电脑登录同一账号可自动恢复。部署前请在 Supabase 执行仓库内对应迁移 SQL。
                </span>
              ) : null}
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
            绑定抖音来客
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
          <div className={cn('rounded-lg border p-6', bindCardShell.box)}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center">
                <div
                  className={cn(
                    'mr-4 flex h-10 w-10 items-center justify-center rounded-lg',
                    bindCardShell.icon,
                  )}
                >
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h4 className="font-medium text-gray-900">{bindCardShell.title}</h4>
                    {(bindCardTone === 'ok' || bindCardTone === 'degraded') && boundAccountName ? (
                      <span
                        className={
                          bindCardTone === 'ok'
                            ? 'text-sm font-medium text-emerald-900'
                            : 'text-sm font-medium text-amber-950'
                        }
                      >
                        {boundAccountName}
                      </span>
                    ) : bindCardTone === 'pending' ? null : boundAccountName ? (
                      <span className="text-sm font-medium text-gray-800">{boundAccountName}</span>
                    ) : null}
                  </div>
                  {bindCardShell.subtitle ? (
                    <p className="mt-1 text-sm text-gray-700">{bindCardShell.subtitle}</p>
                  ) : null}
                  <p className="text-sm text-gray-500">
                    商户 ID：{boundMerchantId || '—'}
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
            <MerchantSyncControls
              bound
              lastSyncAt={lastSyncAt}
              isRefreshing={manualRefreshing}
              onManualRefresh={manualRefresh}
              onAutoRefresh={autoRefreshRun}
              autoRefreshEnabled={autoRefresh}
              onAutoRefreshEnabledChange={persistAuto}
            />
            <p className="mt-3 text-xs text-gray-600">
              绑定凭证保存在本机浏览器（跨标签页共享）；自动刷新仅重新拉取门店列表，不会因接口失败而解除绑定。只有点击「断开连接」才会清除绑定。
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-sm font-semibold text-gray-900">账户门店明细</h4>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜索门店名称、地址…"
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="shrink-0">每页</span>
                  <select
                    value={pageSize}
                    onChange={(e) =>
                      setPageSize(Number(e.target.value) as PageSize)
                    }
                    className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={10}>10</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </div>
            </div>

            {listError && (
              <div
                className={cn(
                  'mb-3 rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap',
                  listErrorIndicatesInvalidSession(listError) &&
                    !listErrorIndicatesInfrastructure(listError)
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-amber-200 bg-amber-50 text-amber-950',
                )}
              >
                {listError}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">门店 ID</th>
                    <th className="px-3 py-2 font-medium">门店名称</th>
                    <th className="px-3 py-2 font-medium">城市</th>
                    <th className="px-3 py-2 font-medium">地址</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {listLoading ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-gray-500">
                        加载中…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-gray-500">
                        {storesHint ? (
                          <div className="mx-auto max-w-xl space-y-3 text-left">
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 whitespace-pre-wrap">
                              {storesHint}
                            </div>
                            <p className="text-center text-gray-500">
                              若仍有疑问：请核对来客「账户 ID」与开放平台 scope（life.capacity.shop）；本地 dev 由 Vite
                              直连抖音接口。
                            </p>
                          </div>
                        ) : (
                          <>
                            暂无门店数据。请核对来客「账户 ID」与 App 权限（life.capacity.shop），或调整搜索条件；本地
                            dev 由 Vite 直连抖音接口。
                          </>
                        )}
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-mono text-xs text-gray-800">
                          {r.id}
                        </td>
                        <td className="px-3 py-2 text-gray-900">{r.name}</td>
                        <td className="px-3 py-2 text-gray-600">{r.city ?? '—'}</td>
                        <td className="max-w-[240px] truncate px-3 py-2 text-gray-600">
                          {r.address ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{r.status ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
              <span>
                共 <strong className="text-gray-900">{total}</strong> 条，第{' '}
                <span className="tabular-nums">{page}</span> /{' '}
                <span className="tabular-nums">{totalPages}</span> 页
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || listLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages || listLoading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              绑定成功后，门店列表与账号信息来自抖音来客实时接口。若为贵司私有化部署，请在实施文档中配置与服务端约定的「商户数据接口」访问方式；授权与认领流程说明见{' '}
              <a
                href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/auth_with_bind"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                抖音来客 · 能力与门店绑定
              </a>
              。
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-8 text-center text-sm text-gray-600">
          尚未绑定。请点击右上角「绑定抖音来客」，在弹窗中填写 AppID、App Secret 与商户根账户
          ID，提交后将请求后端完成鉴权并拉取门店列表。
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
              <h3 className="text-lg font-semibold text-gray-900">绑定抖音来客</h3>
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
            <p className="mb-4 text-sm text-gray-600">
              凭证将提交至服务端完成鉴权并拉取门店；App Secret 请勿泄露或长期保存在浏览器本地。
            </p>
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
                  placeholder="抖音开放平台 AppID"
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
                    placeholder="开放平台 App Secret"
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
                  商户 ID（merchantId）
                </label>
                <input
                  type="text"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  placeholder="抖音来客商户根账户 ID"
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
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
