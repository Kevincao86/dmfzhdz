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
import OpsPageHero from '../OpsPageHero'
import OpsDeleteSmsConfirmModal from '../components/OpsDeleteSmsConfirmModal'
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
  findMemberForLibraryEntry,
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
import { formatAvgQuoteYuan, resolveLibraryAccountCreatedAt } from '../opsLibraryCreatedAt'
import { buildTalentAvgQuoteMaps } from '../opsTalentQuoteStats'
import type { RegistryMpRecruitmentOrder, RegistryMpTalentMember } from '../opsRegistryApi'
import { readOpsSession, sessionCanEditModule, sessionDataScope } from '../opsStaffAuth'
import { matchStaffDataScope } from '../../meooRegistryShared/opsPermissionsV2'

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
  const session = readOpsSession()
  const staffScope = sessionDataScope(session)
  const canEdit = sessionCanEditModule(session, 'talent_library')
  const [tab, setTab] = useState<RecruitmentPlatform>('抖音')
  const [entries, setEntries] = useState<RegistryTalentLibraryEntry[]>([])
  const [members, setMembers] = useState<RegistryMpTalentMember[]>([])
  const [mpOrders, setMpOrders] = useState<RegistryMpRecruitmentOrder[]>([])
  const [planVersions, setPlanVersions] = useState<MpMembershipPlanVersion[]>([])
  const [q, setQ] = useState('')
  const [genderFilter, setGenderFilter] = useState('全部')
  const [followerFilters, setFollowerFilters] = useState<string[]>([])
  const [levelFilters, setLevelFilters] = useState<string[]>([])
  const [tagFilter, setTagFilter] = useState('全部')
  const [provinceFilters, setProvinceFilters] = useState<string[]>([])
  const [cityFilters, setCityFilters] = useState<string[]>([])
  const [deletePending, setDeletePending] = useState<{
    title: string
    description: string
    run: (deleteSmsCode: string) => Promise<void>
  } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      const membersList = r.mpTalentMembers ?? []
      const enriched = (r.talentLibraryEntries ?? []).map((e) => enrichTalentLibraryEntry(e, membersList))
      setMembers(membersList)
      setMpOrders(r.mpRecruitmentOrders ?? [])
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
    list = list.filter((e) => matchStaffDataScope(e, staffScope))
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
  }, [entries, tab, q, filterState, staffScope])

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
    if (!canEdit || !batch.checkedIds.length || batch.deleting) return
    const count = batch.checkedIds.length
    setDeletePending({
      title: '批量删除达人',
      description: `将删除选中的 ${count} 条达人库记录。\n将同步清除注册表会员与站内信，履约 Web / 达人小程序刷新后可重新填写资料。\n此操作不可恢复。`,
      run: async (deleteSmsCode) => {
        batch.setDeleting(true)
        try {
          const r = await deleteMpLibraryEntries({ kind: 'talent', ids: batch.checkedIds, deleteSmsCode })
          if (!r.ok) {
            window.alert(r.message ?? r.error ?? '删除失败')
            return
          }
          batch.clearChecked(batch.checkedIds)
          await load()
          setDeletePending(null)
        } finally {
          batch.setDeleting(false)
        }
      },
    })
  }

  const quoteMaps = useMemo(
    () => buildTalentAvgQuoteMaps(entries, members, mpOrders),
    [entries, members, mpOrders],
  )

  const colCount = tab === '抖音' ? 20 : 19

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <OpsPageHero heroKey="talent-library" />

      {staffScope.mode !== 'national' ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          当前账号数据范围：
          {staffScope.mode === 'provinces' ? staffScope.provinces.join('、') : staffScope.cities.join('、')}
          {!canEdit ? ' · 仅查看' : ''}
        </div>
      ) : null}

      <OpsMembershipPlanVersionsPanel role="talent" canEdit={canEdit} />

      <div className="ops-card flex flex-wrap items-center gap-3 p-4">
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
        {canEdit ? <OpsLibraryFeaturesImport kind="talent" onDone={load} /> : null}
        {canEdit ? (
          <OpsLibraryBatchFeatures
            kind="talent"
            checkedIds={batch.checkedIds}
            disabled={batch.deleting}
            onDone={load}
          />
        ) : null}
        {canEdit && batch.checkedIds.length > 0 ? (
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

      <div className="ops-library-panel space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ops-muted text-xs font-medium">性别</span>
          {TALENT_GENDER_OPTS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGenderFilter(g)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                genderFilter === g
                  ? 'bg-indigo-600 text-white'
                  : 'ops-filter-chip rounded-md px-2.5 py-1 text-xs transition-colors',
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
                    : 'ops-filter-chip rounded-md px-2.5 py-1 text-xs transition-colors',
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
                    : 'ops-filter-chip rounded-md px-2.5 py-1 text-xs transition-colors',
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
                  : 'ops-filter-chip rounded-md px-2.5 py-1 text-xs transition-colors',
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
                    : 'ops-filter-chip rounded-md px-2.5 py-1 text-xs transition-colors',
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
                  : 'ops-filter-chip rounded-md px-2.5 py-1 text-xs transition-colors',
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

      <div className="ops-library-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ops-library-table min-w-[1320px]">
            <thead>
              <tr>
                <th className="px-3 py-3 w-10">
                  {canEdit ? (
                    <input
                      type="checkbox"
                      checked={batch.allVisibleChecked}
                      onChange={batch.toggleAllVisible}
                      aria-label="全选"
                      className="rounded border-slate-600"
                    />
                  ) : null}
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
                <th>报价</th>
                <th>近30天均报价</th>
                <th>近90天均报价</th>
                <th>主页链接</th>
                <th className="px-3 py-3">联系 / 微信</th>
                <th className="px-3 py-3">收款方式</th>
                <th className="px-3 py-3">会员档位</th>
                <th className="px-3 py-3">增值服务</th>
                <th>账号创建时间</th>
                <th className="text-right">操作</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
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
                  const member = findMemberForLibraryEntry(e, members)
                  const createdAt = resolveLibraryAccountCreatedAt(e, member)
                  return (
                    <tr key={e.id}>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <input
                            type="checkbox"
                            checked={batch.checkedIds.includes(e.id)}
                            onChange={() => batch.toggleRow(e.id)}
                            aria-label={`选择 ${e.lingqiTalentId || e.id}`}
                            className="rounded border-slate-600"
                          />
                        ) : null}
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
                      <td className="tabular-nums text-emerald-600">{e.quotePrice || '—'}</td>
                      <td className="tabular-nums text-emerald-600">
                        {formatAvgQuoteYuan(quoteMaps.avg30[e.id])}
                      </td>
                      <td className="tabular-nums text-emerald-600">
                        {formatAvgQuoteYuan(quoteMaps.avg90[e.id])}
                      </td>
                      <td className="max-w-[180px] text-xs">
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
                      <td className="whitespace-nowrap text-xs ops-muted">{createdAt}</td>
                      <td className="text-right">
                        <Link
                          to={`/talent-library/${encodeURIComponent(e.id)}/permissions`}
                          className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 px-2.5 py-1 text-xs text-white hover:bg-indigo-500"
                        >
                          <Eye className="h-3 w-3" />
                          权限详情
                        </Link>
                      </td>
                      <td className="whitespace-nowrap text-xs ops-muted">{e.updatedAt}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <OpsDeleteSmsConfirmModal
        open={!!deletePending}
        title={deletePending?.title ?? ''}
        description={deletePending?.description ?? ''}
        busy={batch.deleting}
        onClose={() => !batch.deleting && setDeletePending(null)}
        onConfirm={async (code) => {
          if (deletePending) await deletePending.run(code)
        }}
      />
    </div>
  )
}
