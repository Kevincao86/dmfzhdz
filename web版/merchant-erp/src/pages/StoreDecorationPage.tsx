import { Info, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { cn } from '../cn'
import DouyinStoreDecorationStudio, {
  type DecoStudioSection,
} from '../components/store/DouyinStoreDecorationStudio'
import StorePlatformSwitcher, {
  isStorePlatformTab,
} from '../components/store/StorePlatformSwitcher'
import type { StoreDecorationRow } from '../services/merchantStoreDecorationApi'
import { fetchStoreDecorationsForPlatform } from '../services/merchantStoreDecorationApi'
import type { StorePlatformTab } from '../services/merchantStoresApi'

type DecoPageSize = 10 | 50 | 100

const SECTION_IDS: DecoStudioSection[] = [
  'header',
  'cover',
  'facility',
  'notice',
  'staff',
  'dynamic',
  'live',
]

function parseSection(s: string | null): DecoStudioSection {
  if (s && SECTION_IDS.includes(s as DecoStudioSection)) return s as DecoStudioSection
  return 'cover'
}

export default function StoreDecorationPage() {
  const [search, setSearch] = useSearchParams()
  const platParam = search.get('plat')
  const keywordParam = search.get('keyword') ?? ''
  const poiIdParam = search.get('poiId') ?? ''
  const sectionParam = parseSection(search.get('section'))

  const [tab, setTab] = useState<StorePlatformTab>(() =>
    platParam && isStorePlatformTab(platParam) ? platParam : 'douyin',
  )
  const [keyword, setKeyword] = useState(keywordParam)
  const [debouncedKw, setDebouncedKw] = useState(keywordParam)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<DecoPageSize>(10)
  const [rows, setRows] = useState<StoreDecorationRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const douyinStudio = tab === 'douyin' && Boolean(poiIdParam.trim())

  useEffect(() => {
    if (platParam && isStorePlatformTab(platParam) && platParam !== tab) {
      setTab(platParam)
    }
  }, [platParam, tab])

  useEffect(() => {
    if (!keywordParam) return
    setKeyword(keywordParam)
    setDebouncedKw(keywordParam)
  }, [keywordParam])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedKw(keyword.trim()), 300)
    return () => window.clearTimeout(t)
  }, [keyword])

  useEffect(() => {
    setPage(1)
  }, [tab, debouncedKw, pageSize, poiIdParam])

  const load = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (tab === 'douyin' && poiIdParam.trim()) {
        setLoading(false)
        setRows([])
        setTotal(0)
        setError(null)
        return
      }
      setLoading(true)
      setError(null)
      const res = await fetchStoreDecorationsForPlatform(tab, {
        page,
        pageSize,
        keyword: debouncedKw || undefined,
        refresh: opts?.refresh === true,
      })
      setLoading(false)
      if (!res.ok) {
        setRows([])
        setTotal(0)
        setError(res.message)
        return
      }
      setRows(res.items)
      setTotal(res.total)
    },
    [tab, page, pageSize, debouncedKw, poiIdParam],
  )

  useEffect(() => {
    void load()
  }, [load])

  const onTab = (v: StorePlatformTab) => {
    setTab(v)
    setSearch((prev) => {
      const n = new URLSearchParams(prev)
      n.set('plat', v)
      return n
    })
  }

  const setStudioSection = (s: DecoStudioSection) => {
    setSearch((prev) => {
      const n = new URLSearchParams(prev)
      n.set('section', s)
      n.set('plat', 'douyin')
      const pid = poiIdParam.trim()
      if (pid) n.set('poiId', pid)
      return n
    })
  }

  const exitStudio = () => {
    setSearch((prev) => {
      const n = new URLSearchParams(prev)
      n.delete('poiId')
      n.delete('section')
      if (!n.get('plat')) n.set('plat', 'douyin')
      return n
    })
  }

  const banner = useMemo(
    () =>
      tab === 'douyin' ? (
        <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            门店列表与抖音来客侧数据同步；装修区覆盖头图、外显小图、公告、职人等模块。更多素材与上架能力可参考
            <a
              className="mx-1 font-medium text-blue-800 underline"
              href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/sdk-overview"
              target="_blank"
              rel="noreferrer"
            >
              抖音来客开放能力说明
            </a>
            ，由实施环境按需开通。
          </p>
        </div>
      ) : null,
    [tab],
  )

  if (douyinStudio) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="erp-page-title">门店装修 · 抖音来客</h1>
          <p className="mt-1 text-sm text-gray-500">
            门店 POI：<span className="font-mono text-gray-800">{poiIdParam}</span>
            <button
              type="button"
              onClick={() => exitStudio()}
              className="ml-3 text-sm text-blue-600 underline"
            >
              返回列表
            </button>
            <Link to={`/store/detail/douyin/${encodeURIComponent(poiIdParam)}`} className="ml-3 text-sm text-blue-600 underline">
              查看门店详情
            </Link>
          </p>
        </div>
        {banner}
        <DouyinStoreDecorationStudio
          poiId={poiIdParam.trim()}
          section={sectionParam}
          onSectionChange={setStudioSection}
          onExitList={exitStudio}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="erp-page-title">店铺装修</h1>
        <p className="mt-1 text-sm text-gray-500">
          切换平台后分别请求对应「门店查询 / 认领 / 装修状态」聚合接口；抖音来客可在列表中进入单店装修工作台。
        </p>
      </div>

      {banner}

      <StorePlatformSwitcher value={tab} onChange={onTab} />

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs text-gray-500">门店</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="门店名称 / ID"
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            查询
          </button>
          <button
            type="button"
            onClick={() => {
              setKeyword('')
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
        <div className="mt-3 text-sm text-gray-600">
          门店数量：<span className="font-semibold text-gray-900">{loading ? '—' : total}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
            <tr>
              <th className="px-3 py-3">门店名称</th>
              <th className="px-3 py-3">门店审核</th>
              <th className="px-3 py-3">优化建议</th>
              <th className="px-3 py-3">门店信息</th>
              <th className="px-3 py-3">职人展示</th>
              <th className="px-3 py-3">外显小图</th>
              <th className="px-3 py-3">门店相册</th>
              <th className="px-3 py-3">招牌菜和推荐菜</th>
              <th className="px-3 py-3">公告</th>
              <th className="px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                  加载中…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                  暂无装修列表数据
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={`${tab}-${row.id}`} className="border-b border-gray-100 hover:bg-gray-50/80">
                  <td className="px-3 py-3 font-medium text-gray-900">{row.name}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        'text-xs',
                        row.auditStatus?.includes('通过') ? 'text-green-600' : 'text-gray-700',
                      )}
                    >
                      {row.auditStatus ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-600">{row.optimization ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-700">{row.storeInfoStatus ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-700">{row.staffDisplay ?? '—'}</td>
                  <td className="px-3 py-3">
                    {row.coverImageUrl ? (
                      <img
                        src={row.coverImageUrl}
                        alt=""
                        className="h-10 w-10 rounded border border-gray-100 object-cover"
                      />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-700">
                    {row.albumCount != null ? `共${row.albumCount}张` : '—'}
                  </td>
                  <td className="px-3 py-3 text-gray-600">{row.signatureDishes ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-600">{row.announcement ?? '—'}</td>
                  <td className="px-3 py-3 text-right text-blue-600">
                    {tab === 'douyin' ? (
                      <Link
                        className="hover:underline"
                        to={`/store/decoration?plat=douyin&poiId=${encodeURIComponent(row.id)}&section=cover`}
                      >
                        查看
                      </Link>
                    ) : (
                      <button type="button" className="hover:underline">
                        查看
                      </button>
                    )}
                    <span className="mx-2 text-gray-300">|</span>
                    <button type="button" className="hover:underline">
                      装修日志
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
          <span>
            共 {total} 条，第 {Math.min(page, Math.max(1, Math.ceil(total / pageSize) || 1))} /{' '}
            {Math.max(1, Math.ceil(total / pageSize) || 1)} 页
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-500">每页</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as DecoPageSize)}
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
              disabled={page * pageSize >= total || total === 0}
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
