import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isPartnerEdition } from '../lib/appEdition'
import type { TalentPlanCard, TalentPlanSeat } from '../lib/talentPlanRecommend'
import { profileLinkLabel } from '../lib/talentProfileLink'
import { requestTalentPlanRecommend } from '../services/talentPlanRecommendApi'

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

  async function load(nextSeats: TalentPlanSeat[], excluded: string[]) {
    setLoading(true)
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
    setLoading(false)
    if (!res.ok || !res.cards) {
      const raw = res.error?.trim() || ''
      setError(/[\u4e00-\u9fff]/.test(raw) ? raw : '推荐名单暂时取不到，可以先去招募，或稍后再试')
      return
    }
    setCards(res.cards)
    if (res.seats?.length) setLiveSeats(res.seats)
    setCityNote(res.cityNote || '')
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
    const excluded = [...excludedIds, card.talentId]
    const nextSeats = (liveSeats.length ? liveSeats : seats).map((seat) => {
      const current = cards.find((c) => c.seatId === seat.seatId)
      if (seat.seatId === card.seatId) {
        const { lockedTalentId: _drop, ...rest } = seat
        return rest
      }
      if (current?.talentId) return { ...seat, lockedTalentId: current.talentId }
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
      {loading ? <p className="mt-3 text-xs text-slate-500">正在按方案人数配人…</p> : null}
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
