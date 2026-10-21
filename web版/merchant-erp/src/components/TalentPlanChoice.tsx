import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isPartnerEdition } from '../lib/appEdition'
import { buildErpRegistryTenant } from '../lib/buildErpRegistryTenant'
import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import { buildMpOrderFromMerchantRecruitment } from '../lib/merchantMpAutoPublish'
import { submitMerchantRecruitmentWithMpPublish } from '../lib/merchantRecruitmentSubmit'
import type { RegistryRecruitmentOrder } from '../lib/opsRegistryTypes'
import { resolveRecruitmentOrderTenantMeta } from '../lib/recruitmentOrderMeta'
import { supabase } from '../lib/supabaseClient'
import {
  displayTalentProfileLink,
  formatFollowerCount,
  isBrandPublicAccount,
  nicknamesConfirmedExplore,
  talentCardFromPublicSeed,
  talentRosterNote,
  talentCardMatchesCloseWords,
  talentCloseWords,
  type PublicTalentSeed,
  type TalentPlanCard,
  type TalentPlanSeat,
} from '../lib/talentPlanRecommend'
import { profileLinkLabel } from '../lib/talentProfileLink'
import { requestPublicExploreFill, requestTalentPlanRecommend } from '../services/talentPlanRecommendApi'

function TalentAvatar({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false)
  const show = Boolean(url) && !failed
  return (
    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-xs font-medium text-slate-600">
      {show ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        (name || '达').slice(0, 1)
      )}
    </span>
  )
}

type Props = {
  city: string
  platform: string
  talentType: string
  seats: TalentPlanSeat[]
  budgetYuan: number
  headcount: number
  initialMode?: 'choose' | 'recommend'
  /** 助手里点「我要招募」时走原招募预览；方案页不传则打开招募页 */
  onRecruit?: () => void
  onRecommend?: () => void
  onChoose?: () => void
}

function placePublicSeeds(
  cards: TalentPlanCard[],
  seeds: PublicTalentSeed[],
  city: string,
  talentType: string,
  target: number,
): { cards: TalentPlanCard[]; filled: number } {
  let cursor = 0
  let filled = 0
  const want = city.replace(/市$/, '').trim()
  const people = seeds.filter((seed) => {
    const cityName = seed.city || ''
    return !want || !cityName || cityName.includes(want)
  })
  const take = () => {
    const person = people[cursor]
    if (!person) return null
    cursor += 1
    return person
  }
  const seatCard = (seed: PublicTalentSeed, seat: TalentPlanCard) => {
    const card = talentCardFromPublicSeed(seed, seat.seatId, talentType || seat.talentType)
    return {
      ...card,
      tierLabel: seat.tierLabel || card.tierLabel,
      unitBudgetYuan: seat.unitBudgetYuan,
    }
  }
  const next = cards.flatMap((card) => {
    if (!card.empty) return [card]
    const person = take()
    if (!person) return []
    filled += 1
    return [seatCard(person, card)]
  })
  while (next.length < target) {
    const person = take()
    if (!person) break
    filled += 1
    next.push(talentCardFromPublicSeed(person, `public-extra-${filled}`, talentType))
  }
  return { cards: next, filled }
}

function peopleCount(seats: TalentPlanSeat[], headcount: number, budgetYuan: number): number {
  if (seats.length > 0) return seats.length
  if (headcount > 0) return headcount
  if (budgetYuan > 0) return Math.max(3, Math.min(12, Math.round(budgetYuan / 1200)))
  return 0
}

export function TalentPlanChoice({
  city,
  platform,
  talentType,
  seats,
  budgetYuan,
  headcount,
  initialMode = 'choose',
  onRecruit,
  onRecommend,
  onChoose,
}: Props) {
  const navigate = useNavigate()
  const count = peopleCount(seats, headcount, budgetYuan)
  const [mode, setMode] = useState(initialMode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cityNote, setCityNote] = useState('')
  const [cards, setCards] = useState<TalentPlanCard[]>([])
  const [liveSeats, setLiveSeats] = useState<TalentPlanSeat[]>(seats)
  const [excludedIds, setExcludedIds] = useState<string[]>([])
  const [loadingHint, setLoadingHint] = useState('正在按方案人数配人…')
  const skippedPublic = useRef<string[]>([])

  async function load(nextSeats: TalentPlanSeat[], excluded: string[]) {
    setLoading(true)
    setLoadingHint('正在按方案人数配人…')
    setError('')
    const res = await requestTalentPlanRecommend({
      city,
      platform,
      talentType,
      budgetYuan,
      headcount: count,
      seats: nextSeats,
      excludedIds: excluded,
    })
    if (!res.ok || !res.cards) {
      setLoading(false)
      const raw = res.error?.trim() || ''
      setError(/[\u4e00-\u9fff]/.test(raw) ? raw : '推荐名单暂时取不到，可以先去招募，或稍后再试')
      return
    }
    const libraryFilled = res.cards.filter((c) => !c.empty)
    const target = Math.max(count, headcount, res.cards.length)
    const needPublic = Math.max(0, target - libraryFilled.length)
    let nextCards = libraryFilled
    let note = res.cityNote || ''
    if (needPublic > 0) {
      setLoadingHint(`正在从公网补达人，还差 ${needPublic} 位…`)
      const people = await requestPublicExploreFill({
        city,
        industry: talentType || '本地生活',
        gap: needPublic,
        skipNames: [
          ...skippedPublic.current,
          ...libraryFilled.map((c) => c.nickname).filter(Boolean),
        ],
      })
      const filled = placePublicSeeds(res.cards, people.seeds || [], city, talentType, target)
      nextCards = filled.cards
      const short = Math.max(0, target - nextCards.length)
      note = [
        note,
        `星选库 ${libraryFilled.length} 位，公网补了 ${filled.filled} 位。`,
        short > 0 ? `还差 ${short} 位，公网这次没有更多同城达人。` : '',
      ]
        .filter(Boolean)
        .join(' ')
      if (!nextCards.length) {
        setError('公网和星选库都没有可推荐的达人，可以稍后再试。')
      }
    }
    setLoading(false)
    setCards(nextCards)
    if (res.seats?.length) setLiveSeats(res.seats)
    setCityNote(note)
  }

  useEffect(() => {
    if (initialMode !== 'recommend') return
    void load(seats, [])
    // 只在进入推荐时拉一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function chooseRecruit() {
    if (onRecruit) {
      onRecruit()
      return
    }
    navigate(isPartnerEdition() ? '/recruitment/xingxuan/hall' : '/recruitment')
  }

  function chooseRecommend() {
    if (onRecommend) {
      onRecommend()
      return
    }
    setMode('recommend')
    void load(liveSeats.length ? liveSeats : seats, excludedIds)
  }

  function replaceOne(card: TalentPlanCard) {
    if (!card.talentId || loading) return
    if (card.source === 'public') {
      skippedPublic.current = [...skippedPublic.current, card.nickname]
    }
    const excluded = card.source === 'public' ? excludedIds : [...excludedIds, card.talentId]
    const nextSeats = (liveSeats.length ? liveSeats : seats).map((seat) => {
      const current = cards.find((c) => c.seatId === seat.seatId)
      if (seat.seatId === card.seatId) {
        const { lockedTalentId: _drop, ...rest } = seat
        return rest
      }
      if (current?.talentId && current.source !== 'public') return { ...seat, lockedTalentId: current.talentId }
      return seat
    })
    setExcludedIds(excluded)
    setLiveSeats(nextSeats)
    void load(nextSeats, excluded)
  }

  if (mode === 'choose') {
    return (
      <div className="rounded-xl border border-violet-100 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">达人方案怎么用</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {count > 0
            ? `按当前方案约 ${count} 人。先选一件事，系统不会自动发出去。`
            : '先选一件事，系统不会自动发出去。'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={chooseRecommend}
            className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700"
          >
            {count > 0 ? `给我推荐（${count} 人）` : '给我推荐'}
          </button>
          <button
            type="button"
            onClick={chooseRecruit}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            我要招募
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-violet-100 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          {count > 0 ? `推荐 ${cards.filter((c) => !c.empty).length || count} 位达人` : '推荐达人'}
        </p>
        <button
          type="button"
          onClick={() => {
            setMode('choose')
            onChoose?.()
          }}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          返回选择
        </button>
      </div>
      {cityNote ? <p className="mt-1 text-xs text-slate-500">{cityNote}</p> : null}
      {loading ? <p className="mt-3 text-xs text-slate-500">{loadingHint}</p> : null}
      {error ? <p className="mt-3 text-xs text-amber-700">{error}</p> : null}
      <ul className="mt-3 space-y-2">
        {cards.map((card) => (
          <li
            key={card.seatId}
            className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2"
          >
            {card.empty ? (
              <div>
                <p className="text-sm font-medium text-slate-800">{card.tierLabel}</p>
                <p className="mt-0.5 text-xs text-slate-500">{card.reason}</p>
              </div>
            ) : (
              <div className="flex min-w-0 gap-2.5">
                <TalentAvatar url={card.avatarUrl} name={card.nickname} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {card.nickname}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {card.platform}
                      {card.city ? ` · ${card.city}` : ''}
                      {followerLabel(card)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                    {card.tierLabel}
                    {card.unitBudgetYuan > 0 ? ` · 车马费¥${card.unitBudgetYuan}` : ''}
                    {card.quoteYuan != null ? ` · 报价¥${card.quoteYuan}` : ''}
                    {card.level ? ` · ${card.level}` : ''}
                    {card.tags.length ? ` · ${card.tags.slice(0, 2).join('/')}` : ''}
                  </p>
                  {card.source === 'public' ? (
                    <p className="mt-0.5 text-xs text-violet-700">{card.reason || '公网补位'}</p>
                  ) : null}
                  {displayTalentProfileLink(card) ? (
                    <a
                      href={displayTalentProfileLink(card)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-block text-xs text-violet-700 hover:underline"
                    >
                      {jumpLabel(card.platform, displayTalentProfileLink(card))}
                    </a>
                  ) : null}
                  <p className="mt-0.5 text-xs text-slate-500">{card.reason}</p>
                </div>
              </div>
            )}
            <button
              type="button"
              disabled={loading || card.empty}
              onClick={() => replaceOne(card)}
              className="shrink-0 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              替换
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

type RosterNotice = {
  summary: string
  people: TalentPlanCard[]
}

function followerLabel(card: TalentPlanCard): string {
  if (card.source === 'public' && !card.followersVerified) return ''
  if (card.followers <= 0) return ''
  const text = card.source === 'public' ? formatFollowerCount(card.followers) : String(card.followers)
  return text ? ` · 粉丝${text}` : ''
}

function jumpLabel(platform: string, url: string): string {
  if (/\/search\//.test(url)) return '去抖音搜这位达人'
  return profileLinkLabel(platform, url)
}

async function sendTargetedInvites(
  mpOrderId: string,
  talentMemberIds: string[],
): Promise<{ added?: number; newInvites?: { talentMemberId?: string }[] }> {
  if (!supabase) throw new Error('请先登录后再发定向招募')
  const { data: sessionData } = await supabase.auth.getSession()
  const token = String(sessionData.session?.access_token || '').trim()
  if (!token) throw new Error('请先登录后再发定向招募')
  const payload = JSON.stringify({ action: 'send_invites', mpOrderId, talentMemberIds })
  let last = '定向邀约没有发出去'
  for (const url of merchantApiFetchUrls('/api/meoo-ops-mp-targeted-recruit')) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      })
      const body = (await res.json()) as {
        ok?: boolean
        error?: string
        message?: string
        added?: number
        newInvites?: { talentMemberId?: string }[]
      }
      if (!res.ok || body.ok === false) {
        last = body.message || body.error || last
        continue
      }
      return body
    } catch {
      /* try next */
    }
  }
  throw new Error(last)
}

export function TalentChatRoster({
  cards,
  city,
  talentType,
  storeName,
  note,
  seenIds,
  seenNames,
  onCardsChange,
}: {
  cards: TalentPlanCard[]
  city: string
  talentType: string
  storeName: string
  note: string
  seenIds?: string[]
  seenNames?: string[]
  onCardsChange: (cards: TalentPlanCard[], seen: { ids: string[]; names: string[] }, note?: string) => void
}) {
  const [replacingId, setReplacingId] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<RosterNotice | null>(null)
  const seenIdSet = useRef(
    new Set(
      [...(seenIds || []), ...cards.map((item) => item.talentId)].filter(
        (id) => id && !id.startsWith('public:'),
      ),
    ),
  )
  const seenNameSet = useRef(
    new Set([...(seenNames || []), ...cards.map((item) => item.nickname)].filter(Boolean)),
  )
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const toppedUp = useRef(false)
  const onCardsChangeRef = useRef(onCardsChange)
  onCardsChangeRef.current = onCardsChange
  const pendingKey = cards
    .filter((card) => card.source === 'public' && !card.exploreVerified && !card.empty)
    .map((card) => card.nickname)
    .join('\n')
  const shown = cards.filter((card) => card.source !== 'public' || card.exploreVerified)

  useEffect(() => {
    if (!pendingKey) {
      setChecking(false)
      return
    }
    const ac = new AbortController()
    let cancelled = false
    setChecking(true)
    void (async () => {
      const current = cardsRef.current
      const pending = current.filter((card) => card.source === 'public' && !card.exploreVerified && !card.empty)
      const confirmed = await nicknamesConfirmedExplore(
        pending.map((card) => card.nickname),
        city,
        ac.signal,
      )
      if (cancelled || ac.signal.aborted) return
      const next = current.flatMap((card) => {
        if (card.source !== 'public' || card.exploreVerified || card.empty) return [card]
        if (isBrandPublicAccount(card.nickname, `${card.reason || ''}${card.talentType || ''}`)) return []
        if (!confirmed.has(card.nickname)) return []
        return [{ ...card, exploreVerified: true }]
      })
      setChecking(false)
      const changed =
        next.length !== current.length ||
        next.some((card, index) => card.exploreVerified !== current[index]?.exploreVerified)
      if (changed) {
        onCardsChangeRef.current(next, { ids: [...seenIdSet.current], names: [...seenNameSet.current] })
      }
    })()
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [pendingKey, city])

  useEffect(() => {
    if (toppedUp.current || pendingKey) return
    const wanted = Number((note.match(/方案要\s*(\d{1,2})\s*位/) || [])[1] || 0)
    const current = cardsRef.current
    if (!wanted || wanted > 20 || current.length >= wanted) return
    let cancelled = false
    toppedUp.current = true
    setChecking(true)
    void (async () => {
      try {
        const filled = await requestPublicExploreFill({
          city,
          industry: talentType || '本地生活',
          gap: wanted - current.length,
          skipNames: current.map((card) => card.nickname),
        })
        if (cancelled) return
        if (!filled.ok) {
          toppedUp.current = false
          return
        }
        const seeds = filled.seeds || []
        const latest = cardsRef.current
        const have = new Set(latest.flatMap((card) => [card.nickname, card.nickname.replace(/[（(].*$/, '').trim()]))
        const extra = seeds.filter((seed) => {
          const bare = seed.nickname.replace(/[（(].*$/, '').trim()
          return seed.nickname && !have.has(seed.nickname) && !have.has(bare)
        })
        if (!extra.length) return
        const next = [
          ...latest,
          ...extra.map((seed, index) => talentCardFromPublicSeed(seed, `public-fill-${index + 1}`, talentType || '本地生活')),
        ]
        const libraryCount = next.filter((card) => card.source !== 'public').length
        onCardsChangeRef.current(
          next,
          { ids: [...seenIdSet.current], names: [...seenNameSet.current] },
          talentRosterNote(wanted, libraryCount, next.length - libraryCount),
        )
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()
    return () => {
      cancelled = true
      toppedUp.current = false
      setChecking(false)
    }
  }, [pendingKey, note, city, talentType])

  function rememberSeen() {
    for (const item of cards) {
      if (item.talentId && !item.talentId.startsWith('public:')) seenIdSet.current.add(item.talentId)
      if (item.nickname) seenNameSet.current.add(item.nickname)
    }
  }

  async function replaceOne(card: TalentPlanCard) {
    if (replacingId || publishing) return
    setReplacingId(card.seatId)
    setError('')
    rememberSeen()
    if (card.talentId && !card.talentId.startsWith('public:')) seenIdSet.current.add(card.talentId)
    if (card.nickname) seenNameSet.current.add(card.nickname)
    const skipNames = [...seenNameSet.current]
    const excludedIds = [...seenIdSet.current]
    const res = await requestTalentPlanRecommend({
      city,
      platform: card.platform || '抖音',
      talentType: talentType || card.talentType || '本地生活',
      budgetYuan: 5000,
      headcount: 20,
      seats: [],
      excludedIds,
    })
    const closeWords = talentCloseWords(talentType)
    const fromLibrary = (res.cards || []).find(
      (item) =>
        item.nickname.trim() &&
        !item.empty &&
        !seenNameSet.current.has(item.nickname) &&
        !seenIdSet.current.has(item.talentId) &&
        talentCardMatchesCloseWords(item, closeWords),
    )
    let next = fromLibrary ? { ...fromLibrary, seatId: card.seatId } : null
    if (!next) {
      const filled = await requestPublicExploreFill({
        city,
        industry: talentType || card.talentType || '本地生活',
        gap: 1,
        skipNames,
      })
      const seed = (filled.seeds || []).find((item) => item.nickname && !seenNameSet.current.has(item.nickname))
      if (seed) {
        const cardBuilt = talentCardFromPublicSeed(seed, card.seatId, talentType || card.talentType)
        next = {
          ...cardBuilt,
          tierLabel: card.tierLabel || cardBuilt.tierLabel,
          unitBudgetYuan: card.unitBudgetYuan,
        }
      }
    }
    setReplacingId('')
    if (!next || seenNameSet.current.has(next.nickname)) {
      setError('星选库和公网暂时没有可替换的达人')
      return
    }
    if (next.talentId && !next.talentId.startsWith('public:')) seenIdSet.current.add(next.talentId)
    seenNameSet.current.add(next.nickname)
    onCardsChange(
      cards.map((item) => (item.seatId === card.seatId ? next : item)),
      { ids: [...seenIdSet.current], names: [...seenNameSet.current] },
    )
    setNotice(null)
  }

  async function publishTargeted() {
    if (publishing || replacingId) return
    setPublishing(true)
    setError('')
    setNotice(null)
    const library = shown.filter((card) => card.source !== 'public' && !card.empty && card.nickname)
    const publicCards = shown.filter((card) => card.source === 'public' && !card.empty)
    const inviteIds = [...new Set(library.map((card) => card.memberId).filter((id): id is string => Boolean(id)))]
    if (!inviteIds.length) {
      setPublishing(false)
      setNotice({
        summary: '这些达人还不在星选库，定向招募发不进站内。请通过主页自行联系。',
        people: publicCards.length ? publicCards : library,
      })
      return
    }
    try {
      const tenant = buildErpRegistryTenant()
      const tenantMeta = await resolveRecruitmentOrderTenantMeta(supabase)
      const now = new Date().toLocaleString('zh-CN', { hour12: false })
      const names = library.map((card) => card.nickname).join('、')
      const order: RegistryRecruitmentOrder = {
        id: `RO-AI${Date.now()}`,
        ...tenantMeta,
        customerName: tenant?.merchantName || storeName || '灵祺 ERP 商户',
        storeName: storeName || city || '门店',
        talentId: '—',
        talentName: names.slice(0, 80) || '定向达人',
        fans: inviteIds.length,
        accountType: '抖音',
        recruitmentPlatform: '抖音',
        coopTimes: 0,
        createdAt: now,
        status: 'pending',
        serviceAmount: 0,
        commissionPct: 0,
        netAmount: 0,
        storeAddress: city || storeName || '—',
        category: talentType || '本地生活',
        infoSummary: `【定向招募】${storeName || city} · ${talentType || '达人'} · ${names}`,
        fulfillmentLoop: 'open',
        orderKind: 'recruitment',
        autoPublishMp: true,
      }
      const mp = buildMpOrderFromMerchantRecruitment(order)
      mp.recruitCount = inviteIds.length
      mp.title = `${storeName || '门店'}·定向招募`
      mp.mpPublishMeta = {
        ...(mp.mpPublishMeta || {}),
        recruitScope: 'targeted',
        targetedStatus: 'inviting',
      }
      const published = await submitMerchantRecruitmentWithMpPublish(order, undefined, mp)
      const invited = await sendTargetedInvites(published.mpOrderId, inviteIds)
      const invitedIds = new Set((invited.newInvites || []).map((row) => String(row.talentMemberId || '')))
      const missed = library.filter(
        (card) => card.memberId && invitedIds.size > 0 && !invitedIds.has(card.memberId),
      )
      const people = [...publicCards, ...missed]
      const invitedCount = invited.added ?? inviteIds.length
      setNotice({
        summary: people.length
          ? `已发布定向招募，站内已邀请 ${invitedCount} 位星选达人。下面这些达人还不在星选库，需要您自行联系。`
          : `已发布定向招募，已向 ${invitedCount} 位星选达人发出邀约。`,
        people,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '定向招募没有发出去')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-violet-100 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">推荐 {shown.length} 位达人</p>
        <button
          type="button"
          disabled={publishing || Boolean(replacingId) || shown.length === 0}
          onClick={() => void publishTargeted()}
          className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {publishing ? '正在发布…' : '定向招募'}
        </button>
      </div>
      {checking ? <p className="mt-1 text-xs text-slate-500">正在按方案人数继续检索探店达人…</p> : null}
      {error ? <p className="mt-2 text-xs text-amber-700">{error}</p> : null}
      <ul className="mt-3 space-y-2">
        {shown.map((card) => (
          <li
            key={card.seatId}
            className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2"
          >
            <div className="flex min-w-0 gap-2.5">
              <TalentAvatar url={card.avatarUrl} name={card.nickname} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {card.nickname}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {card.source === 'public' ? '公网' : '星选库'}
                    {card.city ? ` · ${card.city}` : ''}
                    {followerLabel(card)}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {card.quoteYuan != null ? `报价¥${card.quoteYuan}` : card.reason}
                  {card.tags.length ? ` · ${card.tags.slice(0, 2).join('/')}` : ''}
                </p>
                {displayTalentProfileLink(card) ? (
                  <a
                    href={displayTalentProfileLink(card)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-block text-xs text-violet-700 hover:underline"
                  >
                    {jumpLabel(card.platform, displayTalentProfileLink(card))}
                  </a>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-400">主页未核到</p>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={Boolean(replacingId) || publishing}
              onClick={() => void replaceOne(card)}
              className="shrink-0 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {replacingId === card.seatId ? '替换中…' : '替换'}
            </button>
          </li>
        ))}
      </ul>
      {notice ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
          <p>{notice.summary}</p>
          {notice.people.length ? (
            <ul className="mt-2 space-y-1">
              {notice.people.map((person) => (
                <li key={person.seatId}>
                  {person.nickname}
                  {displayTalentProfileLink(person) ? (
                    <a
                      href={displayTalentProfileLink(person)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-violet-700 underline"
                    >
                      {jumpLabel(person.platform, displayTalentProfileLink(person))}
                    </a>
                  ) : (
                    <span className="ml-2 text-amber-800/80">主页未核到</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
