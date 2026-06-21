import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  deleteTalentPrQuote,
  fetchTalentPrQuotes,
  searchPrUsers,
  upsertTalentPrQuote,
  type TalentPrExclusiveQuoteRow,
} from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'
import { TALENT_PLATFORMS } from '../lib/mpSync/talentPlatformProfiles'
import { readMember, writeMember } from '../lib/mpSync/talentMember'

type PrSearchHit = {
  id: string
  lingqiPrId: string
  displayName: string
  city?: string
}

function buildQuoteGroups(quotes: TalentPrExclusiveQuoteRow[]) {
  const byPlatform = new Map<string, TalentPrExclusiveQuoteRow[]>()
  for (const q of quotes) {
    const plat = String(q.platform || '抖音').trim()
    const list = byPlatform.get(plat) || []
    list.push(q)
    byPlatform.set(plat, list)
  }
  const groups: { platform: string; items: TalentPrExclusiveQuoteRow[] }[] = []
  for (const p of TALENT_PLATFORMS) {
    const items = byPlatform.get(p.name)
    if (items?.length) groups.push({ platform: p.name, items })
  }
  for (const [platform, items] of byPlatform) {
    if (TALENT_PLATFORMS.some((p) => p.name === platform)) continue
    groups.push({ platform, items })
  }
  return groups
}

export default function TalentPrQuotesPage() {
  if (getActiveRole() !== 'talent') return <Navigate to="/profile" replace />

  const [quotes, setQuotes] = useState<TalentPrExclusiveQuoteRow[]>(() => {
    const member = readMember()
    return Array.isArray(member?.prExclusiveQuotes) ? member.prExclusiveQuotes : []
  })
  const [platformName, setPlatformName] = useState('抖音')
  const [prQuery, setPrQuery] = useState('')
  const [prResults, setPrResults] = useState<PrSearchHit[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [prSearchEmpty, setPrSearchEmpty] = useState(false)
  const [exclusivePrId, setExclusivePrId] = useState('')
  const [exclusivePrName, setExclusivePrName] = useState('')
  const [exclusiveQuoteYuan, setExclusiveQuoteYuan] = useState('')
  const [exclusiveNote, setExclusiveNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [editingKey, setEditingKey] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void fetchTalentPrQuotes()
      .then((rows) => {
        setQuotes(rows)
        const member = readMember()
        if (member) writeMember({ ...member, prExclusiveQuotes: rows })
      })
      .catch(() => {})
  }, [])

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setPrResults([])
      setShowDropdown(false)
      setPrSearchEmpty(false)
      return
    }
    if (/^LQ-P-/i.test(q.trim())) {
      setExclusivePrId(q.trim().toUpperCase())
      setPrResults([])
      setShowDropdown(false)
      setPrSearchEmpty(false)
      return
    }
    setShowDropdown(true)
    try {
      const results = await searchPrUsers(q)
      setPrResults(results)
      setPrSearchEmpty(results.length === 0)
    } catch {
      setPrResults([])
      setPrSearchEmpty(true)
    }
  }, [])

  function onPrQueryChange(value: string) {
    setPrQuery(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      void runSearch(value)
    }, 280)
  }

  function pickPr(hit: PrSearchHit) {
    setExclusivePrId(hit.lingqiPrId)
    setExclusivePrName(hit.displayName)
    setPrQuery(hit.displayName ? `${hit.displayName} · ${hit.lingqiPrId}` : hit.lingqiPrId)
    setPrResults([])
    setShowDropdown(false)
    setPrSearchEmpty(false)
  }

  function clearForm() {
    setEditingKey('')
    setExclusivePrId('')
    setExclusivePrName('')
    setExclusiveQuoteYuan('')
    setExclusiveNote('')
    setPrQuery('')
    setPrResults([])
    setShowDropdown(false)
    setPrSearchEmpty(false)
  }

  function onEditQuote(q: TalentPrExclusiveQuoteRow) {
    const prLingqiId = String(q.prLingqiId || '').trim()
    const platform = String(q.platform || '抖音').trim()
    const displayName = String(q.prDisplayName || '').trim()
    setEditingKey(`${prLingqiId}|${platform}`)
    setPlatformName(platform)
    setExclusivePrId(prLingqiId)
    setExclusivePrName(displayName)
    setExclusiveQuoteYuan(String(q.quoteYuan ?? ''))
    setExclusiveNote(String(q.note || ''))
    setPrQuery(displayName ? `${displayName} · ${prLingqiId}` : prLingqiId)
    setPrResults([])
    setShowDropdown(false)
    setPrSearchEmpty(false)
    setMsg('')
    document.querySelector('.quote-form-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function onAddQuote() {
    const prLingqiId = exclusivePrId.trim()
    const quoteYuan = Number(String(exclusiveQuoteYuan || '').replace(/,/g, ''))
    if (!/^LQ-P-/i.test(prLingqiId)) {
      setMsg('请填写有效 PRID（如 LQ-P-000003）')
      return
    }
    if (!Number.isFinite(quoteYuan) || quoteYuan <= 0) {
      setMsg('请填写有效专属报价（元）')
      return
    }
    setSaving(true)
    setMsg('')
    const wasEditing = !!editingKey
    try {
      const rows = await upsertTalentPrQuote({
        prLingqiId,
        prDisplayName: exclusivePrName.trim() || undefined,
        platform: platformName,
        quoteYuan: Math.round(quoteYuan),
        note: exclusiveNote.trim() || undefined,
      })
      setQuotes(rows)
      const member = readMember()
      if (member) writeMember({ ...member, prExclusiveQuotes: rows })
      clearForm()
      setMsg(wasEditing ? '专属报价已更新' : '专属报价已保存，可继续添加其他 PR')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function onRemoveQuote(q: TalentPrExclusiveQuoteRow) {
    if (!window.confirm(`删除对 ${q.prDisplayName || q.prLingqiId} 的专属报价？`)) return
    setSaving(true)
    setMsg('')
    try {
      const rows = await deleteTalentPrQuote(q.prLingqiId, q.platform)
      setQuotes(rows)
      const member = readMember()
      if (member) writeMember({ ...member, prExclusiveQuotes: rows })
      if (editingKey === `${q.prLingqiId}|${q.platform}`) clearForm()
      setMsg('已删除')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '删除失败')
    } finally {
      setSaving(false)
    }
  }

  const quoteGroups = buildQuoteGroups(quotes)

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/profile" className="text-sm text-[var(--shell-muted)] hover:text-[var(--shell-text)]">
          ← 我的
        </Link>
        <h2 className="text-xl font-bold">我的报价</h2>
      </div>

      <div className="surface-card rounded-xl border p-4 space-y-3">
        <p className="text-sm font-medium">已设置的专属价</p>
        <p className="text-xs text-[var(--shell-muted)]">同一平台可设置多个 PR 专属价（如 PR1、PR2 各不同价格）</p>
        {quoteGroups.length === 0 ? (
          <p className="text-xs text-[var(--shell-muted)]">暂无专属 PR 报价</p>
        ) : (
          <div className="space-y-4 text-sm">
            {quoteGroups.map((group) => (
              <div key={group.platform}>
                <p className="text-xs font-semibold text-sky-600 mb-2">{group.platform}</p>
                <ul className="space-y-2">
                  {group.items.map((q) => (
                    <li
                      key={`${q.prLingqiId}-${q.platform}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/5 px-3 py-2"
                    >
                      <span>
                        {q.prDisplayName || q.prLingqiId} · ¥{q.quoteYuan}
                        <span className="text-[var(--shell-muted)] ml-2">{q.prLingqiId}</span>
                        {q.note ? <span className="text-[var(--shell-muted)] ml-2">{q.note}</span> : null}
                      </span>
                      <span className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-sky-600 hover:text-sky-500"
                          disabled={saving}
                          onClick={() => onEditQuote(q)}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-500 hover:text-red-400"
                          disabled={saving}
                          onClick={() => void onRemoveQuote(q)}
                        >
                          删除
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface-card quote-form-anchor rounded-xl border p-4 space-y-4">
        <div>
          <p className="text-sm font-medium">{editingKey ? '编辑专属 PR 报价' : '添加专属 PR 报价'}</p>
          <p className="text-xs text-[var(--shell-muted)] mt-1">
            {editingKey
              ? '修改报价或备注后保存；PR 与平台不可变更'
              : '可输入 PRID 精准匹配，或输入名称/手机号模糊搜索后点选；保存后可继续添加下一个 PR'}
          </p>
        </div>

        <div>
          <span className="text-sm text-[var(--shell-muted)]">平台</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {TALENT_PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`rounded-full px-3 py-1 text-xs border ${
                  platformName === p.name
                    ? 'border-sky-400 bg-sky-50 text-sky-700'
                    : 'border-transparent bg-black/5 text-[var(--shell-muted)]'
                }`}
                onClick={() => setPlatformName(p.name)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <label className="block relative">
          <span className="text-sm text-[var(--shell-muted)]">PR（PRID / 名称）</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            placeholder="LQ-P-000003 或 PR 名称"
            value={prQuery}
            onChange={(e) => onPrQueryChange(e.target.value)}
            onFocus={() => {
              if (prResults.length) setShowDropdown(true)
            }}
            onBlur={() => {
              setTimeout(() => setShowDropdown(false), 200)
            }}
          />
          {showDropdown ? (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-[var(--shell-bg)] shadow-lg">
              {prResults.length > 0 ? (
                prResults.map((hit) => (
                  <li key={hit.lingqiPrId}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-black/5"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickPr(hit)}
                    >
                      <span className="font-medium">{hit.displayName}</span>
                      <span className="ml-2 text-xs text-[var(--shell-muted)]">
                        {hit.lingqiPrId}
                        {hit.city ? ` · ${hit.city}` : ''}
                      </span>
                    </button>
                  </li>
                ))
              ) : prSearchEmpty ? (
                <li className="px-3 py-2 text-xs text-[var(--shell-muted)]">未找到匹配的 PR，请检查名称或改用 PRID</li>
              ) : null}
            </ul>
          ) : null}
        </label>

        <label className="block">
          <span className="text-sm text-[var(--shell-muted)]">PRID</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            placeholder="LQ-P-000003"
            value={exclusivePrId}
            onChange={(e) => setExclusivePrId(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-sm text-[var(--shell-muted)]">PR 名称（选填）</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={exclusivePrName}
            onChange={(e) => setExclusivePrName(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-sm text-[var(--shell-muted)]">专属报价（元）</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={exclusiveQuoteYuan}
            onChange={(e) => setExclusiveQuoteYuan(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-sm text-[var(--shell-muted)]">备注（选填）</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={exclusiveNote}
            onChange={(e) => setExclusiveNote(e.target.value)}
          />
        </label>

        {msg ? <p className="text-sm text-amber-600">{msg}</p> : null}

        <button
          type="button"
          disabled={saving}
          className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          onClick={() => void onAddQuote()}
        >
          {saving ? '保存中…' : editingKey ? '保存修改' : '保存专属报价'}
        </button>
        {editingKey ? (
          <button
            type="button"
            disabled={saving}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-black/5 disabled:opacity-50"
            onClick={clearForm}
          >
            取消编辑
          </button>
        ) : null}
      </div>
    </div>
  )
}
