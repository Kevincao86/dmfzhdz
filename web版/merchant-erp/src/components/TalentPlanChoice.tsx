import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isPartnerEdition } from '../lib/appEdition'
import type { TalentPlanCard, TalentPlanSeat } from '../lib/talentPlanRecommend'
import { profileLinkLabel } from '../lib/talentProfileLink'
import { requestTalentPlanRecommend } from '../services/talentPlanRecommendApi'
import { postAiChat } from '../services/ai/aiClient'

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

function parseFans(raw: string): number {
  const t = raw.replace(/粉丝/g, '').trim()
  const wan = t.match(/(\d+(?:\.\d+)?)\s*万/)
  if (wan) return Math.round(Number(wan[1]) * 10000)
  const n = t.match(/(\d{2,})/)
  return n ? Number(n[1]) : 0
}

function parsePublicTalentLines(
  text: string,
  cityHint = '',
  limit = 20,
): Array<{
  nickname: string
  city: string
  followers: number
  level: string
  reason: string
}> {
  const cap = Math.min(20, Math.max(1, limit))
  const out: Array<{ nickname: string; city: string; followers: number; level: string; reason: string }> = []
  const seen = new Set<string>()
  const push = (row: { nickname: string; city: string; followers: number; level: string; reason: string }) => {
    const key = row.nickname.trim()
    if (key.length < 2 || seen.has(key) || out.length >= cap) return
    seen.add(key)
    out.push(row)
  }
  const want = cityHint.replace(/市$/, '').trim()
  for (const line of text.split(/\n+/)) {
    const row = line.replace(/^[\s\d.、\-•*]+/, '').replace(/\*\*/g, '').trim()
    if (!row || /^公网暂无|^暂无符合/.test(row)) continue
    const parts = row.split(/[|｜]/).map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 2) {
      const nickname = parts[0]!.replace(/^昵称[:：]/, '').slice(0, 24)
      if (/^达人$|^公网$|^检索$/.test(nickname)) continue
      push({
        nickname,
        city: parts[1] || cityHint,
        followers: parseFans(parts[2] || row),
        level: parts[3] || '',
        reason: parts.slice(4).join(' ').slice(0, 80),
      })
      continue
    }
    if (want && !row.includes(want) && !/粉丝|万粉|探店/.test(row)) continue
    const nickname = (row.match(/[\u4e00-\u9fffA-Za-z0-9_（）()]{2,16}/) || [])[0] || ''
    if (!nickname || nickname === want || /^(达人|公网|检索|粉丝|探店|本地生活)$/.test(nickname)) continue
    push({
      nickname: nickname.replace(/[（(].*$/, '').slice(0, 24),
      city: cityHint,
      followers: parseFans(row),
      level: '',
      reason: row.slice(0, 80),
    })
  }
  return out
}

async function fetchPublicTalents(opts: {
  city: string
  talentType: string
  platform: string
  count: number
  skipNames: string[]
}): Promise<ReturnType<typeof parsePublicTalentLines>> {
  const city = opts.city.trim() || '门店所在城市'
  const need = opts.talentType.trim() || '本地生活'
  const want = Math.min(20, Math.max(1, opts.count))
  const skip = opts.skipNames.filter(Boolean).slice(0, 24)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 90000)
  try {
    const data = await postAiChat(
      {
        provider: 'doubao',
        stream: false,
        temperature: 0,
        webSearch: true,
        messages: [
          {
            role: 'system',
            content: `你是豆包公网达人检索。请联网搜索「${city} 抖音 探店达人」「${city} ${need} 达人」。只写${opts.platform || '抖音'}、区域在「${city}」、内容贴近「${need}」的达人，凑满 ${want} 位。不要前言。每行严格：昵称｜${city}｜粉丝数字｜等级｜内容方向。不要电话或微信。${skip.length ? `不要重复：${skip.join('、')}。` : ''}`,
          },
          {
            role: 'user',
            content: `城市：${city}\n搜索：${city} 抖音 达人 探店 ${need}\n请列出 ${want} 位达人。`,
          },
        ],
      },
      { signal: ac.signal },
    )
    return parsePublicTalentLines(String(data.content || ''), city, want)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

async function fetchPublicTalentsUntil(opts: {
  city: string
  talentType: string
  platform: string
  count: number
  skipNames: string[]
}): Promise<ReturnType<typeof parsePublicTalentLines>> {
  const all: ReturnType<typeof parsePublicTalentLines> = []
  const seen = new Set(opts.skipNames)
  let left = Math.min(20, Math.max(0, opts.count))
  for (let round = 0; round < 2 && left > 0; round += 1) {
    const batch = await fetchPublicTalents({
      ...opts,
      count: left,
      skipNames: [...seen],
    })
    if (!batch.length) break
    for (const person of batch) {
      if (seen.has(person.nickname)) continue
      seen.add(person.nickname)
      all.push(person)
    }
    left = Math.min(20, opts.count) - all.length
  }
  return all
}

function publicCard(
  person: { nickname: string; city: string; followers: number; level: string; reason: string },
  base: TalentPlanCard,
  city: string,
  platform: string,
): TalentPlanCard {
  return {
    ...base,
    empty: false,
    talentId: `public:${person.nickname}`,
    nickname: person.nickname,
    city: person.city || city,
    platform: platform || base.platform || '抖音',
    followers: person.followers,
    level: person.level || base.tierLabel,
    quoteYuan: null,
    tags: [],
    avatarUrl: '',
    profileLink: '',
    source: 'public',
    reason: person.reason ? `公网 · ${person.reason}` : '公网补位',
  }
}

function fillEmptyCardsFromPublic(
  cards: TalentPlanCard[],
  people: ReturnType<typeof parsePublicTalentLines>,
  city: string,
  platform: string,
  target: number,
): { cards: TalentPlanCard[]; filled: number } {
  let cursor = 0
  let filled = 0
  const want = city.replace(/市$/, '').trim()
  const take = () => {
    while (cursor < people.length) {
      const cityName = people[cursor]?.city || ''
      if (!want || !cityName || cityName.includes(want)) break
      cursor += 1
    }
    const person = people[cursor]
    if (!person) return null
    cursor += 1
    return person
  }
  const next = cards.flatMap((card) => {
    if (!card.empty) return [card]
    const person = take()
    if (!person) return []
    filled += 1
    return [publicCard(person, card, city, platform)]
  })
  const template = cards.find((card) => !card.empty) || cards[0]
  while (template && next.length < target) {
    const person = take()
    if (!person) break
    filled += 1
    next.push(
      publicCard(
        person,
        { ...template, seatId: `public-extra-${filled}`, tierLabel: template.tierLabel || '公网' },
        city,
        platform,
      ),
    )
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
      const people = await fetchPublicTalentsUntil({
        city,
        talentType,
        platform,
        count: needPublic,
        skipNames: [
          ...skippedPublic.current,
          ...libraryFilled.map((c) => c.nickname).filter(Boolean),
        ],
      })
      const filled = fillEmptyCardsFromPublic(res.cards, people, city, platform, target)
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
                      {card.followers > 0 ? ` · 粉丝${card.followers}` : ''}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                    {card.tierLabel}
                    {card.unitBudgetYuan > 0 ? ` · 车马费¥${card.unitBudgetYuan}` : ''}
                    {card.quoteYuan != null ? ` · 报价¥${card.quoteYuan}` : ''}
                    {card.level ? ` · ${card.level}` : ''}
                  </p>
                  {card.source === 'public' ? (
                    <p className="mt-0.5 text-xs text-violet-700">{card.reason || '公网补位'}</p>
                  ) : null}
                  {card.profileLink ? (
                    <a
                      href={card.profileLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-block text-xs text-violet-700 hover:underline"
                    >
                      {profileLinkLabel(card.platform, card.profileLink)}
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
