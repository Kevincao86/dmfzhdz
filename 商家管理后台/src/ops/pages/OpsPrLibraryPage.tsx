import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { cn } from '../../cn'
import { normalizeMpMembershipTier, tierLabel } from '../../meooRegistryShared/mpMembershipCatalog'
import {
  buildCityOpts,
  buildProvinceOpts,
  toggleChip,
} from '../../meooRegistryShared/libraryRegionFilters'
import { matchPrLibraryFilters } from '../../meooRegistryShared/prLibraryFilters'
import { deleteMpLibraryEntries, fetchRegistry, type RegistryMpPrUser } from '../opsRegistryApi'
import OpsLibraryBatchFeatures from '../OpsLibraryBatchFeatures'
import OpsLibraryFeaturesImport from '../OpsLibraryFeaturesImport'
import { useOpsBatchSelection } from '../useOpsBatchSelection'

function readPrFeatures(u: RegistryMpPrUser) {
  const raw = u.prFeatureAccess
  return {
    addons: raw?.addons === true,
    recommendHall: raw?.recommendHall === true,
  }
}

function stablePrSortKey(u: RegistryMpPrUser): string {
  return u.lingqiPrId || u.id
}

function formatPrPlatformAccount(u: RegistryMpPrUser): string {
  const acct = String(u.platformAccount || u.wxOpenId || u.contactPhone || '').trim()
  if (!acct) return '—'
  if (acct.length <= 16) return acct
  return `${acct.slice(0, 8)}…${acct.slice(-6)}`
}

function formatPrSource(u: RegistryMpPrUser): string {
  if (u.sourceChannel === 'mp') return '小程序'
  if (u.sourceChannel === 'web') return '履约 Web'
  if (u.wxOpenId || u.platformAccount) return '小程序'
  if (u.contactPhone) return '履约 Web'
  return '—'
}

export default function OpsPrLibraryPage() {
  const [rows, setRows] = useState<RegistryMpPrUser[]>([])
  const [q, setQ] = useState('')
  const [provinceFilters, setProvinceFilters] = useState<string[]>([])
  const [cityFilters, setCityFilters] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      setRows(r.mpPrUsers ?? [])
    } catch {
      setRows([])
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(t)
  }, [load])

  const filterState = useMemo(
    () => ({
      provinces: provinceFilters,
      cities: cityFilters,
    }),
    [provinceFilters, cityFilters],
  )

  const provinceOpts = useMemo(() => buildProvinceOpts(rows), [rows])
  const cityOpts = useMemo(() => buildCityOpts(rows, provinceFilters), [rows, provinceFilters])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = rows.filter((u) => matchPrLibraryFilters(u, filterState))
    if (needle) {
      list = list.filter((u) => {
        const blob = [
          u.lingqiPrId,
          u.platformAccount,
          u.wxOpenId,
          u.companyName,
          u.personalName,
          u.contactName,
          u.contactPhone,
          u.wechatId,
          u.wxNickName,
          u.province,
          u.city,
        ]
          .join(' ')
          .toLowerCase()
        return blob.includes(needle)
      })
    }
    return list.sort((a, b) => stablePrSortKey(a).localeCompare(stablePrSortKey(b), 'zh-CN'))
  }, [rows, q, filterState])

  const rowIds = useMemo(() => filtered.map((u) => u.id), [filtered])
  const batch = useOpsBatchSelection(rowIds)

  const hasActiveFilters = provinceFilters.length > 0 || cityFilters.length > 0

  async function onBatchDelete() {
    if (!batch.checkedIds.length || batch.deleting) return
    if (
      !window.confirm(
        `确定删除选中的 ${batch.checkedIds.length} 位 PR 用户？\n将同步清除注册表 PR 资料，小程序 / 履约 Web 刷新后可重新填写。`,
      )
    ) {
      return
    }
    batch.setDeleting(true)
    try {
      const r = await deleteMpLibraryEntries({ kind: 'pr', ids: batch.checkedIds })
      if (!r.ok) {
        window.alert(r.error ?? '删除失败')
        return
      }
      batch.clearChecked(batch.checkedIds)
      await load()
    } finally {
      batch.setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">PR 用户库</h1>
        <p className="mt-1 text-sm text-slate-500">
          小程序 PR 填写资料后自动入库；点击<strong className="text-slate-300">权限详情</strong>可查看星选会员全部权限并手动调整档位与增值服务。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索 PRID / 平台账号 / 机构 / 联系人 / 手机 / 微信 / 省市"
          className="min-w-[240px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        />
        <button type="button" onClick={() => void load()} className="text-xs text-indigo-400 hover:underline">
          刷新
        </button>
        <OpsLibraryFeaturesImport kind="pr" onDone={load} />
        <OpsLibraryBatchFeatures
          kind="pr"
          checkedIds={batch.checkedIds}
          disabled={batch.deleting}
          onDone={load}
        />
        {batch.checkedIds.length > 0 ? (
          <button
            type="button"
            disabled={batch.deleting}
            onClick={() => void onBatchDelete()}
            className="rounded-lg border border-rose-700 bg-rose-950/40 px-3 py-2 text-sm text-rose-300 hover:bg-rose-950 disabled:opacity-50"
          >
            {batch.deleting ? '删除中…' : `批量删除（${batch.checkedIds.length}）`}
          </button>
        ) : null}
        <span className="text-xs text-slate-500">共 {filtered.length} 人</span>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        {provinceOpts.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">省份</span>
            {provinceOpts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setProvinceFilters((prev) => toggleChip(prev, p))
                  setCityFilters([])
                }}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  provinceFilters.includes(p)
                    ? 'bg-amber-600 text-white'
                    : 'border border-slate-700 text-slate-400 hover:text-white',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        ) : null}

        {cityOpts.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">城市</span>
            {cityOpts.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCityFilters((prev) => toggleChip(prev, c))}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  cityFilters.includes(c)
                    ? 'bg-orange-600 text-white'
                    : 'border border-slate-700 text-slate-400 hover:text-white',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() => {
              setProvinceFilters([])
              setCityFilters([])
            }}
            className="text-xs text-slate-500 underline hover:text-slate-300"
          >
            清除筛选
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/80 text-xs text-slate-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={batch.allVisibleChecked}
                  onChange={batch.toggleAllVisible}
                  aria-label="全选"
                  className="rounded border-slate-600"
                />
              </th>
              <th className="px-4 py-3">PRID</th>
              <th className="px-4 py-3">平台账号</th>
              <th className="px-4 py-3">主体</th>
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">联系人</th>
              <th className="px-4 py-3">手机</th>
              <th className="px-4 py-3">微信</th>
              <th className="px-4 py-3">地区</th>
              <th className="px-4 py-3">来源</th>
              <th className="px-4 py-3">会员档位</th>
              <th className="px-4 py-3">增值服务</th>
              <th className="px-4 py-3 text-right">操作</th>
              <th className="px-4 py-3">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-t border-slate-800/80 hover:bg-slate-900/50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={batch.checkedIds.includes(u.id)}
                    onChange={() => batch.toggleRow(u.id)}
                    aria-label={`选择 ${u.lingqiPrId}`}
                    className="rounded border-slate-600"
                  />
                </td>
                <td className="px-4 py-3 font-mono text-indigo-300">{u.lingqiPrId}</td>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-slate-300" title={u.platformAccount || u.wxOpenId || ''}>
                    {formatPrPlatformAccount(u)}
                  </div>
                  {u.wxNickName ? (
                    <div className="text-xs text-slate-500">{u.wxNickName}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">{u.accountType === 'personal' ? '个人' : '机构'}</td>
                <td className="px-4 py-3">
                  {u.accountType === 'personal' ? u.personalName : u.companyName}
                </td>
                <td className="px-4 py-3">{u.contactName || '—'}</td>
                <td className="px-4 py-3">{u.contactPhone || '—'}</td>
                <td className="px-4 py-3">{u.wechatId || u.wxNickName || '—'}</td>
                <td className="px-4 py-3">
                  {[u.province, u.city].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="px-4 py-3 text-xs">{formatPrSource(u)}</td>
                <td className="px-4 py-3 text-xs text-slate-300">
                  {tierLabel(normalizeMpMembershipTier(u.mpMembershipPlan))}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      readPrFeatures(u).addons
                        ? 'bg-emerald-900/50 text-emerald-300'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {readPrFeatures(u).addons ? '已开通' : '未开通'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/pr-library/${encodeURIComponent(u.id)}/permissions`}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 px-2.5 py-1 text-xs text-white hover:bg-indigo-500"
                  >
                    <Eye className="h-3 w-3" />
                    权限详情
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{u.updatedAt}</td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td colSpan={14} className="px-4 py-12 text-center text-slate-500">
                  暂无 PR 用户，请引导小程序 PR 身份保存资料
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
