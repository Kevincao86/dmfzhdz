import { ArrowLeft, MapPin, Phone, Store } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { readMerchantSession } from '../lib/merchantSession'
import type { DouyinStoreRow } from '../services/douyinMerchantApi'
import { getDouyinStoreDetail, type DouyinStoreDetailResult } from '../services/douyinMerchantApi'
import type { StorePlatformTab } from '../services/merchantStoresApi'

function isPlatform(s: string | undefined): s is StorePlatformTab {
  return s === 'douyin' || s === 'meituan' || s === 'xiaohongshu' || s === 'jd'
}

function safeJson(v: unknown, space = 2): string {
  try {
    return JSON.stringify(v, null, space)
  } catch {
    return String(v)
  }
}

export default function StoreDetailPage() {
  const { platform, poiId } = useParams<{ platform: string; poiId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const taskIdsFromUrl = (searchParams.get('taskIds') ?? '').trim()

  const [row, setRow] = useState<DouyinStoreRow | null>(null)
  const [certInfo, setCertInfo] = useState<Record<string, unknown> | null>(null)
  const [certInfoError, setCertInfoError] = useState<string | null>(null)
  const [taskQuery, setTaskQuery] = useState<Record<string, unknown> | null>(null)
  const [taskQueryError, setTaskQueryError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isPlatform(platform) || !poiId) {
      setError('无效的访问路径')
      setLoading(false)
      return
    }
    if (platform !== 'douyin') {
      setError('门店详情当前仅支持抖音来客。其它平台入口即将开放，敬请期待。')
      setLoading(false)
      return
    }
    const token = readMerchantSession('meoo_douyin_merchant_token')
    if (!token) {
      setError('请先在「系统 → 商家版后台」绑定抖音来客。')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setCertInfo(null)
    setCertInfoError(null)
    setTaskQuery(null)
    setTaskQueryError(null)
    const res: DouyinStoreDetailResult = await getDouyinStoreDetail({
      accessToken: token,
      poiId,
      taskIds: taskIdsFromUrl || undefined,
    })
    setLoading(false)
    if (!res.ok || res.items.length === 0) {
      setRow(null)
      setError(res.ok ? '未获取到门店数据' : res.message)
      return
    }
    let rowItem: DouyinStoreRow | null = res.items[0] ?? null
    if (rowItem && res.certInfo?.data && typeof res.certInfo.data === 'object') {
      const d = res.certInfo.data as Record<string, unknown>
      const sub =
        d.subject && typeof d.subject === 'object' ? (d.subject as Record<string, unknown>) : null
      const company = typeof sub?.company_name === 'string' ? sub.company_name.trim() : ''
      if (!rowItem.organization?.trim() && company) {
        rowItem = { ...rowItem, organization: company }
      }
    }
    setRow(rowItem)
    if (res.certInfo) setCertInfo(res.certInfo)
    if (res.certInfoError) setCertInfoError(res.certInfoError)
    if (res.taskQuery) setTaskQuery(res.taskQuery)
    if (res.taskQueryError) setTaskQueryError(res.taskQueryError)
  }, [platform, poiId, taskIdsFromUrl])

  useEffect(() => {
    void load()
  }, [load])

  const certData =
    certInfo?.data && typeof certInfo.data === 'object'
      ? (certInfo.data as Record<string, unknown>)
      : null
  const subject =
    certData?.subject && typeof certData.subject === 'object'
      ? (certData.subject as Record<string, unknown>)
      : null

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        返回
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="erp-page-title">门店详情</h1>
          <p className="mt-1 text-sm text-gray-500">
            以下为已绑定抖音来客账号下的门店信息与资质摘要；认领、改资质等异步任务状态会在有权限时一并展示。更多接口说明见{' '}
            <a
              className="text-blue-600 underline"
              href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/shop.query"
              target="_blank"
              rel="noreferrer"
            >
              抖音来客开放平台 · 门店相关文档
            </a>
            。
          </p>
        </div>
        {isPlatform(platform) && poiId ? (
          <Link
            to={`/store/decoration?plat=${platform}&poiId=${encodeURIComponent(poiId)}`}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            去门店装修
          </Link>
        ) : null}
      </div>

      {loading && <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">加载中…</div>}

      {error && !loading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      )}

      {!loading && row && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex gap-4">
            {row.avatarUrl ? (
              <img
                src={row.avatarUrl}
                alt=""
                className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-gray-100"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
                <Store className="h-8 w-8" />
              </div>
            )}
            <div>
              <div className="text-xl font-semibold text-gray-900">{row.name}</div>
              <div className="mt-1 text-sm text-gray-500">门店 ID：{row.id}</div>
              {row.claimStatus ? (
                <div className="mt-1 text-sm text-amber-800">认领 / 审核：{row.claimStatus}</div>
              ) : null}
            </div>
          </div>

          <dl className="grid gap-3 text-sm">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">所属组织</dt>
              <dd className="text-gray-900">{row.organization ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  营业电话
                </span>
              </dt>
              <dd className="text-gray-900">{row.phone ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">营业信息</dt>
              <dd className="text-gray-900">
                <div>{row.businessStatus ?? row.status ?? '—'}</div>
                {row.businessHours ? (
                  <div className="mt-0.5 text-xs text-gray-600">{row.businessHours}</div>
                ) : null}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  详细地址
                </span>
              </dt>
              <dd className="text-gray-900">{row.addressHierarchy ?? row.address ?? row.city ?? '—'}</dd>
            </div>
          </dl>

          {certInfoError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              资质接口未返回或无权访问：{certInfoError}
            </div>
          ) : null}

          {subject && (
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4 text-sm">
              <div className="font-medium text-gray-800">资质摘要</div>
              <dl className="mt-2 grid gap-2 text-xs">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-gray-500">主体名称</dt>
                  <dd className="text-gray-900">
                    {typeof subject.company_name === 'string' ? subject.company_name : '—'}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-gray-500">法人</dt>
                  <dd className="text-gray-900">
                    {typeof subject.legal_person_name === 'string' ? subject.legal_person_name : '—'}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-gray-500">证照号</dt>
                  <dd className="text-gray-900">
                    {typeof subject.license_id === 'string' ? subject.license_id : '—'}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {taskQueryError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              任务查询失败：{taskQueryError}
            </div>
          ) : null}

          {taskQuery && Object.keys(taskQuery).length > 0 ? (
            <details className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700" open>
              <summary className="cursor-pointer font-medium text-gray-800">异步任务原始数据</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-white p-2 text-[11px] leading-relaxed">
                {safeJson(taskQuery)}
              </pre>
            </details>
          ) : taskIdsFromUrl ? (
            <p className="text-xs text-gray-500">已携带任务编号，但未获取到任务结果（请确认权限或任务编号是否正确）。</p>
          ) : null}

          {certInfo ? (
            <details className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
              <summary className="cursor-pointer font-medium text-gray-800">资质接口完整返回</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-white p-2 text-[11px] leading-relaxed">
                {safeJson(certInfo)}
              </pre>
            </details>
          ) : null}

          <details className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700">门店原始数据</summary>
            <p className="mt-2">电话、营业时间等以抖音来客返回为准。</p>
          </details>
        </div>
      )}
    </div>
  )
}
