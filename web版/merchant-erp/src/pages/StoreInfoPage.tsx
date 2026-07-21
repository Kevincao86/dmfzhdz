import { RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../cn'
import StoreContactEditModal from '../components/store/StoreContactEditModal'
import StorePlatformSwitcher from '../components/store/StorePlatformSwitcher'
import {
  applyStoreContactOverrides,
  getStoreContactOverride,
} from '../lib/storeContactOverride'
import type { DouyinStoreRow } from '../services/douyinMerchantApi'
import { fetchStoresForPlatform, type StorePlatformTab } from '../services/merchantStoresApi'

type PageSizeOption = 10 | 50 | 100

type ClaimStatusFilterOption =
  | 'all'
  | 'store_auditing'
  | 'store_audit_fail'
  | 'pending_qual'
  | 'reviewing'

type BusinessStatusFilterOption = 'all' | 'open' | 'rest' | 'closed'

const REGION_HINTS = [
  '北京市',
  '上海市',
  '广东省 佛山市',
  '广东省 广州市',
  '陕西省 渭南市',
  '浙江省 杭州市',
  '浙江省 杭州市 上城区',
  '四川省 成都市',
  '江苏省 南京市',
  '湖北省 武汉市',
]

export default function StoreInfoPage() {
  const [tab, setTab] = useState<StorePlatformTab>('douyin')
  const [relationType, setRelationType] = useState<'0' | '1' | '2' | 'all'>('0')
  const [keyword, setKeyword] = useState('')
  const [debouncedKw, setDebouncedKw] = useState('')
  const [provinceCity, setProvinceCity] = useState('')
  const [claimStatusFilter, setClaimStatusFilter] = useState<ClaimStatusFilterOption>('all')
  const [businessStatusFilter, setBusinessStatusFilter] = useState<BusinessStatusFilterOption>('all')
  const [storeBrand, setStoreBrand] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSizeOption>(10)
  const [rows, setRows] = useState<DouyinStoreRow[]>([])
  /** 平台原始行（未合并手填），用于判断哪些字段可编辑 */
  const [apiRows, setApiRows] = useState<DouyinStoreRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<DouyinStoreRow | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedKw(keyword.trim()), 300)
    return () => window.clearTimeout(t)
  }, [keyword])

  useEffect(() => {
    setPage(1)
  }, [
    tab,
    debouncedKw,
    relationType,
    pageSize,
    provinceCity,
    claimStatusFilter,
    businessStatusFilter,
    storeBrand,
  ])

  const load = useCallback(
    async (opts?: { refresh?: boolean }) => {
      setLoading(true)
      setError(null)
      const res = await fetchStoresForPlatform(tab, {
        page,
        pageSize,
        keyword: debouncedKw || undefined,
        relationType: tab === 'douyin' ? relationType : undefined,
        refresh: opts?.refresh === true,
        provinceCity: tab === 'douyin' ? provinceCity.trim() || undefined : undefined,
        claimStatusFilter: tab === 'douyin' ? claimStatusFilter : undefined,
        businessStatusFilter: tab === 'douyin' ? businessStatusFilter : undefined,
        storeBrand: tab === 'douyin' ? storeBrand.trim() || undefined : undefined,
      })
      setLoading(false)
      if (!res.ok) {
        setRows([])
        setApiRows([])
        setTotal(0)
        setError(res.message)
        return
      }
      setApiRows(res.items)
      setRows(applyStoreContactOverrides(tab, res.items))
      setTotal(res.total)
    },
    [
      tab,
      page,
      pageSize,
      debouncedKw,
      relationType,
      provinceCity,
      claimStatusFilter,
      businessStatusFilter,
      storeBrand,
    ],
  )

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="erp-page-title">店铺信息</h1>
        <p className="mt-1 text-sm text-gray-500">
          门店列表来自抖音「查询门店信息」
          <a
            className="mx-1 text-blue-600 underline"
            href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/shop.query"
            target="_blank"
            rel="noreferrer"
          >
            shop.query
          </a>
          ；单店详情页会合并「查询门店资质信息」
          <a
            className="mx-1 text-blue-600 underline"
            href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/store-qualification-info"
            target="_blank"
            rel="noreferrer"
          >
            cert/info
          </a>
          与可选「查询门店任务结果」
          <a
            className="mx-1 text-blue-600 underline"
            href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/task.query"
            target="_blank"
            rel="noreferrer"
          >
            task.query
          </a>
          。SDK：
          <a
            className="mx-1 text-blue-600 underline"
            href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/sdk-overview"
            target="_blank"
            rel="noreferrer"
          >
            OpenAPI SDK 总览
          </a>
          。
        </p>
      </div>

      <StorePlatformSwitcher value={tab} onChange={setTab} />

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs text-gray-500">门店名称</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="门店名称、门店 ID、三方 ID 或备注关键词"
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
          {tab === 'douyin' && (
            <div>
              <label className="mb-1 block text-xs text-gray-500">账户门店关系</label>
              <select
                value={relationType}
                onChange={(e) => setRelationType(e.target.value as typeof relationType)}
                className="min-w-[140px] rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-500"
              >
                <option value="0">认领</option>
                <option value="1">关联</option>
                <option value="2">挂靠</option>
                <option value="all">全部（合并去重）</option>
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            查询
          </button>
          <button
            type="button"
            onClick={() => {
              setKeyword('')
              setProvinceCity('')
              setClaimStatusFilter('all')
              setBusinessStatusFilter('all')
              setStoreBrand('')
              setPage(1)
            }}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            重置
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={cn('mr-1 h-4 w-4', loading && 'animate-spin')} />
            刷新
          </button>
          {tab === 'douyin' && (
            <button
              type="button"
              onClick={() => void load({ refresh: true })}
              disabled={loading}
              className="rounded-lg border border-pink-200 bg-pink-50 px-4 py-2 text-sm font-medium text-pink-800 hover:bg-pink-100 disabled:opacity-50"
            >
              同步抖音来客
            </button>
          )}
        </div>

        {tab === 'douyin' && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">按省市</label>
              <input
                value={provinceCity}
                onChange={(e) => setProvinceCity(e.target.value)}
                list="store-region-hints"
                placeholder="省 / 市 / 区关键词"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <datalist id="store-region-hints">
                {REGION_HINTS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">认领状态</label>
              <select
                value={claimStatusFilter}
                onChange={(e) => setClaimStatusFilter(e.target.value as ClaimStatusFilterOption)}
                className="min-w-[160px] rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-500"
              >
                <option value="all">全部</option>
                <option value="store_auditing">门店审核中</option>
                <option value="store_audit_fail">门店审核失败</option>
                <option value="pending_qual">待提交资质</option>
                <option value="reviewing">审核中</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">营业状态</label>
              <select
                value={businessStatusFilter}
                onChange={(e) => setBusinessStatusFilter(e.target.value as BusinessStatusFilterOption)}
                className="min-w-[120px] rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-500"
              >
                <option value="all">全部</option>
                <option value="open">营业中</option>
                <option value="rest">休息/打烊</option>
                <option value="closed">停业</option>
              </select>
            </div>
            <div className="min-w-[140px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">门店品牌</label>
              <input
                value={storeBrand}
                onChange={(e) => setStoreBrand(e.target.value)}
                placeholder="品牌关键词"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[960px] w-full border-collapse text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
            <tr>
              <th className="px-3 py-3">门店信息</th>
              <th className="px-3 py-3">所属组织</th>
              <th className="px-3 py-3">营业电话</th>
              <th className="px-3 py-3">营业信息</th>
              <th className="px-3 py-3">详细地址</th>
              <th className="px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  加载中…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  暂无门店数据（请检查绑定、筛选条件或点击「同步抖音来客」重拉缓存）
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => {
                const apiRow = apiRows.find((r) => r.id === row.id)
                const ov = getStoreContactOverride(tab, row.id)
                const phoneManual = Boolean(ov?.phone?.trim()) && !apiRow?.phone?.trim()
                const hoursManual =
                  Boolean(ov?.businessHours?.trim()) && !apiRow?.businessHours?.trim()
                const canFill =
                  !apiRow?.phone?.trim() || !apiRow?.businessHours?.trim()
                return (
                <tr key={`${tab}-${row.id}`} className="border-b border-gray-100 hover:bg-gray-50/80">
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-2">
                      {row.avatarUrl ? (
                        <img
                          src={row.avatarUrl}
                          alt=""
                          className="mt-0.5 h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-gray-100"
                        />
                      ) : (
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500">
                          店
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900">{row.name}</div>
                        <div className="mt-0.5 text-xs text-gray-500">门店ID：{row.id}</div>
                        {row.claimStatus ? (
                          <div className="mt-0.5 text-xs text-amber-700">认领：{row.claimStatus}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-gray-700">{row.organization ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-700">
                    <div>{row.phone?.trim() ? row.phone : '—'}</div>
                    {phoneManual ? (
                      <div className="mt-0.5 text-[11px] text-blue-600">手动补充</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-gray-700">
                    <div>{row.businessStatus ?? row.status ?? '—'}</div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {row.businessHours?.trim() ? row.businessHours : '—'}
                    </div>
                    {hoursManual ? (
                      <div className="mt-0.5 text-[11px] text-blue-600">营业时间手动补充</div>
                    ) : null}
                  </td>
                  <td className="max-w-[240px] px-3 py-3 text-gray-700">
                    {row.addressHierarchy ?? row.address ?? row.city ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {canFill ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditTarget(row)}
                          className="text-blue-600 hover:underline"
                        >
                          {phoneManual || hoursManual ? '改补充' : '补充电话/时间'}
                        </button>
                        <span className="mx-2 text-gray-300">|</span>
                      </>
                    ) : null}
                    <Link
                      to={`/store/decoration?plat=${tab}&poiId=${encodeURIComponent(row.id)}`}
                      className="text-blue-600 hover:underline"
                    >
                      门店装修
                    </Link>
                    <span className="mx-2 text-gray-300">|</span>
                    <Link
                      to={`/store/detail/${tab}/${encodeURIComponent(row.id)}`}
                      className="text-blue-600 hover:underline"
                    >
                      门店详情
                    </Link>
                  </td>
                </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      <StoreContactEditModal
        open={Boolean(editTarget)}
        platform={tab}
        poiId={editTarget?.id ?? ''}
        storeName={editTarget?.name}
        platformPhone={apiRows.find((r) => r.id === editTarget?.id)?.phone}
        platformBusinessHours={apiRows.find((r) => r.id === editTarget?.id)?.businessHours}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setRows(applyStoreContactOverrides(tab, apiRows))
        }}
      />

      {!loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
          <span>
            共 {total} 条，第 {Math.min(page, totalPages)} / {totalPages} 页
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-500">每页</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as PageSizeOption)}
              className="rounded border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500"
            >
              <option value={10}>10</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-gray-200 px-3 py-1 disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={page >= totalPages || total === 0}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-gray-200 px-3 py-1 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
