import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { cn } from '../../cn'
import { listMembershipPlanVersions, resolvePlanVersionLabel } from '../../meooRegistryShared/mpMembershipCatalog'
import type { MpMembershipPlanVersion } from '../../meooRegistryShared/mpMembershipCatalog'
import {
  deleteMpLibraryEntries,
  fetchRegistry,
  type RegistryTalentLibraryEntry,
} from '../opsRegistryApi'
import OpsMembershipPlanVersionsPanel from '../OpsMembershipPlanVersionsPanel'
import OpsLibraryFeaturesImport from '../OpsLibraryFeaturesImport'
import OpsLibraryBatchFeatures from '../OpsLibraryBatchFeatures'
import { useOpsBatchSelection } from '../useOpsBatchSelection'
import {
  buildCityOpts,
  buildProvinceOpts,
  toggleChip,
} from '../../meooRegistryShared/libraryRegionFilters'
import { RECRUITMENT_PLATFORMS, type RecruitmentPlatform } from '../../meooRegistryShared/recruitmentInfoFilter'
import {
  enrichTalentLibraryEntry,
  matchTalentLibraryFilters,
  TALENT_DOUYIN_LEVEL_OPTS,
  TALENT_FOLLOWER_TIER_OPTS,
  TALENT_GENDER_OPTS,
  TALENT_LIBRARY_TAG_OPTS,
} from '../../meooRegistryShared/talentLibraryFilters'
import {
  extractProfileLinkUrl,
  profileLinkLabel,
  resolveTalentProfileHref,
} from '../../meooRegistryShared/talentProfileLink'

function readTalentFeatures(e: RegistryTalentLibraryEntry) {
  const raw = e.mpFeatureAccess
  return {
    addons: raw?.addons === true,
    recommendHall: raw?.recommendHall === true,
  }
}

function stableTalentSortKey(e: RegistryTalentLibraryEntry): string {
  return e.lingqiTalentId || e.platformAccount || e.id
}

export default function OpsTalentLibraryPage() {
  const [tab, setTab] = useState<RecruitmentPlatform>('抖音')
  const [entries, setEntries] = useState<RegistryTalentLibraryEntry[]>([])
  const [planVersions, setPlanVersions] = useState<MpMembershipPlanVersion[]>([])
  const [q, setQ] = useState('')
  const [genderFilter, setGenderFilter] = useState('全部')
  const [followerFilters, setFollowerFilters] = useState<string[]>([])
  const [levelFilters, setLevelFilters] = useState<string[]>([])
  const [tagFilter, setTagFilter] = useState('全部')
  const [provinceFilters, setProvinceFilters] = useState<string[]>([])
  const [cityFilters, setCityFilters] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      const members = r.mpTalentMembers ?? []
      const enriched = (r.talentLibraryEntries ?? []).map((e) => enrichTalentLibraryEntry(e, members))
      setEntries(enriched)
      setPlanVersions(listMembershipPlanVersions(r, 'talent'))
    } catch {
      setEntries([])
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(t)
  }, [load])

  const filterState = useMemo(
    () => ({
      gender: genderFilter,
      followerTiers: followerFilters,
      douyinLevels: levelFilters,
      tag: tagFilter,
      provinces: provinceFilters,
      cities: cityFilters,
    }),
    [genderFilter, followerFilters, levelFilters, tagFilter, provinceFilters, cityFilters],
  )

  const platformEntries = useMemo(
    () => entries.filter((e) => e.platform === tab),
    [entries, tab],
  )

  const provinceOpts = useMemo(() => buildProvinceOpts(platformEntries), [platformEntries])
  const cityOpts = useMemo(
    () => buildCityOpts(platformEntries, provinceFilters),
    [platformEntries, provinceFilters],
  )

  const rows = useMemo(() => {
    const plat = tab
    let list = entries.filter((e) => e.platform === plat)
    list = list.filter((e) => matchTalentLibraryFilters(e, filterState))
    const needle = q.trim().toLowerCase()
    if (needle) {
      list = list.filter(
        (e) =>
          e.platformAccount.toLowerCase().includes(needle) ||
          e.platformNickname.toLowerCase().includes(needle) ||
          e.contact.toLowerCase().includes(needle) ||
          e.wechatId.toLowerCase().includes(needle) ||
          (e.lingqiTalentId || '').toLowerCase().includes(needle) ||
          (e.gender || '').toLowerCase().includes(needle) ||
          (e.accountTags || []).join(' ').toLowerCase().includes(needle) ||
          extractProfileLinkUrl(e.profileLink).toLowerCase().includes(needle) ||
          (e.province || '').toLowerCase().includes(needle) ||
          (e.city || '').toLowerCase().includes(needle),
      )
    }
    return [...list].sort((a, b) => stableTalentSortKey(a).localeCompare(stableTalentSortKey(b), 'zh-CN'))
  }, [entries, tab, q, filterState])

  const rowIds = useMemo(() => rows.map((e) => e.id), [rows])
  const batch = useOpsBatchSelection(rowIds)

  const hasActiveFilters =
    genderFilter !== '全部' ||
    followerFilters.length > 0 ||
    levelFilters.length > 0 ||
    tagFilter !== '全部' ||
    provinceFilters.length > 0 ||
    cityFilters.length > 0

  async function onBatchDelete() {
    if (!batch.checkedIds.length || batch.deleting) return
    if (
      !window.confirm(
        `确定删除选中的 ${batch.checkedIds.length} 条达人库记录？\n将同步清除注册表会员与站内信，履约 Web / 达人小程序刷新后可重新填写资料。`,
      )
    ) {
      return
    }
    batch.setDeleting(true)
    try {
      const r = await deleteMpLibraryEntries({ kind: 'talent', ids: batch.checkedIds })
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

  const colCount = tab === '抖音' ? 17 : 16

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">灵祺达人库</h1>
        <p className="mt-1 text-sm text-slate-500">
          达人填写平台资料或报名后按平台账号去重入库；点击<strong className="text-slate-300">权限详情</strong>查看星选达人版会员权限并手动调整。
        </p>
      </div>

      <OpsMembershipPlanVersionsPanel role="talent" />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap rounded-lg border border-slate-700 p-0.5">
          {RECRUITMENT_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setTab(p)}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                tab === p ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white',
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索达人 ID / 昵称 / 省市 / 联系 / 微信 / 标签"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        />
        <button type="button" onClick={() => void load()} className="text-xs text-indigo-400 hover:underline">
          刷新
        </button>
        <OpsLibraryFeaturesImport kind="talent" onDone={load} />
        <OpsLibraryBatchFeatures
          kind="talent"
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
        <span className="text-xs text-slate-500">
          {tab} · {rows.length} 人
        </span>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">性别</span>
          {TALENT_GENDER_OPTS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGenderFilter(g)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                genderFilter === g
                  ? 'bg-indigo-600 text-white'
                  : 'border border-slate-700 text-slate-400 hover:text-white',
              )}
            >
              {g}
            </button>
          ))}
        </div>

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

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">粉丝量级</span>
          {TALENT_FOLLOWER_TIER_OPTS.map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setFollowerFilters((prev) => toggleChip(prev, tier))}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                followerFilters.includes(tier)
                  ? 'bg-sky-600 text-white'
                  : 'border border-slate-700 text-slate-400 hover:text-white',
              )}
            >
              {tier}
            </button>
          ))}
        </div>

        {tab === '抖音' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">带货等级</span>
            {TALENT_DOUYIN_LEVEL_OPTS.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLevelFilters((prev) => toggleChip(prev, lv))}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  levelFilters.includes(lv)
                    ? 'bg-violet-600 text-white'
                    : 'border border-slate-700 text-slate-400 hover:text-white',
                )}
              >
                {lv}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">达人标签</span>
          <button
            type="button"
            onClick={() => setTagFilter('全部')}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs transition-colors',
              tagFilter === '全部'
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-700 text-slate-400 hover:text-white',
            )}
          >
            全部
          </button>
          {TALENT_LIBRARY_TAG_OPTS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tag)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                tagFilter === tag
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-700 text-slate-400 hover:text-white',
              )}
            >
              {tag}
            </button>
          ))}
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setGenderFilter('全部')
                setFollowerFilters([])
                setLevelFilters([])
                setTagFilter('全部')
                setProvinceFilters([])
                setCityFilters([])
              }}
              className="ml-2 text-xs text-slate-500 underline hover:text-slate-300"
            >
              清除筛选
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={batch.allVisibleChecked}
                    onChange={batch.toggleAllVisible}
                    aria-label="全选"
                    className="rounded border-slate-600"
                  />
                </th>
                <th className="px-3 py-3">灵祺达人 ID</th>
                <th className="px-3 py-3">平台账号</th>
                <th className="px-3 py-3">昵称</th>
                <th className="px-3 py-3">性别</th>
                <th className="px-3 py-3">标签</th>
                <th className="px-3 py-3">省份</th>
                <th className="px-3 py-3">城市</th>
                <th className="px-3 py-3">粉丝</th>
                {tab === '抖音' ? <th className="px-3 py-3">带货等级</th> : null}
                <th className="px-3 py-3">报价</th>
                <th className="px-3 py-3">主页链接</th>
                <th className="px-3 py-3">联系 / 微信</th>
                <th className="px-3 py-3">收款方式</th>
                <th className="px-3 py-3">会员档位</th>
                <th className="px-3 py-3">增值服务</th>
                <th className="px-3 py-3 text-right">操作</th>
                <th className="px-3 py-3">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-3 py-10 text-center text-sm text-slate-500">
                    暂无{tab}达人记录。达人填写平台资料或报名成功后将自动写入。
                  </td>
                </tr>
              ) : (
                rows.map((e) => {
                  const href = resolveTalentProfileHref(e.platform, e.profileLink)
                  const label = profileLinkLabel(e.platform, e.profileLink)
                  const tags = e.accountTags || []
                  return (
                    <tr key={e.id} className="hover:bg-slate-800/30">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={batch.checkedIds.includes(e.id)}
                          onChange={() => batch.toggleRow(e.id)}
                          aria-label={`选择 ${e.lingqiTalentId || e.id}`}
                          className="rounded border-slate-600"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-indigo-300">
                        {e.lingqiTalentId || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-300">{e.platformAccount}</td>
                      <td className="px-3 py-2 text-slate-200">{e.platformNickname}</td>
                      <td className="px-3 py-2 text-slate-400">{e.gender || '—'}</td>
                      <td className="max-w-[160px] px-3 py-2 text-xs text-slate-400">
                        {tags.length ? (
                          <span className="line-clamp-2" title={tags.join('、')}>
                            {tags.join('、')}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{e.province || '—'}</td>
                      <td className="px-3 py-2 text-slate-400">{e.city || '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-400">
                        {e.followers.toLocaleString('zh-CN')}
                      </td>
                      {tab === '抖音' ? (
                        <td className="px-3 py-2 text-slate-400">{e.douyinSalesLevel || '—'}</td>
                      ) : null}
                      <td className="px-3 py-2 text-emerald-300">{e.quotePrice || '—'}</td>
                      <td className="max-w-[180px] px-3 py-2 text-xs">
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-300 hover:text-sky-200 hover:underline"
                            title={extractProfileLinkUrl(e.profileLink) || e.profileLink}
                          >
                            {label}
                          </a>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        {e.contact || '—'}
                        <br />
                        {e.wechatId || '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">{e.paymentMethod || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-300">
                        {resolvePlanVersionLabel(e.mpMembershipPlan, planVersions)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            readTalentFeatures(e).addons
                              ? 'bg-emerald-900/50 text-emerald-300'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {readTalentFeatures(e).addons ? '已开通' : '未开通'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to={`/talent-library/${encodeURIComponent(e.id)}/permissions`}
                          className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 px-2.5 py-1 text-xs text-white hover:bg-indigo-500"
                        >
                          <Eye className="h-3 w-3" />
                          权限详情
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">{e.updatedAt}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
