import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { copyTextToClipboard } from '../../lib/copyTextToClipboard'
import {
  buildRecruitmentApplyLink,
  resolveCachedApplyLink,
} from '../../lib/mpSync/recruitmentShareCopy'
import {
  buildRecruitmentSharePosterDataUrl,
  resolvePosterDesign,
  resolvePosterThemeColor,
} from '../../lib/mpSync/recruitmentSharePoster'
import { fetchMpApplyShortLink, fetchMpApplyWxacode } from '../../lib/mpApi'

type Tab = 'poster' | 'code' | 'web'
type WebMode = 'link' | 'text' | 'qr' | 'short'
type Edition = 'normal' | 'pure'

const COLORS = [
  { id: 'sunset', color: '#F97316', index: 0 },
  { id: 'aurora', color: '#7C3AED', index: 1 },
  { id: 'mint', color: '#0D9488', index: 2 },
  { id: 'night', color: '#6366F1', index: 3 },
  { id: 'rose', color: '#E11D48', index: 4 },
  { id: 'gold', color: '#D97706', index: 5 },
]

const FESTIVAL_CDN = 'https://mofangdianai.com/recruit-covers/festivals'
const FESTIVAL_VER = 'festival20261019b'

const FESTIVALS = [
  { id: 'newyear', label: '元旦', blessing: '岁序更新\n万象启明', month: 1, accent: '#C9A227', paper: '#FFFBF2' },
  { id: 'laba', label: '腊八', blessing: '腊粥暖岁\n安康迎春', month: 1, accent: '#9A3412', paper: '#FFF7ED' },
  { id: 'spring', label: '春节', blessing: '春风送暖\n福满人间', month: 2, accent: '#E11D2E', paper: '#FFF7E8' },
  { id: 'lantern', label: '元宵', blessing: '灯火可亲\n月圆人圆', month: 2, accent: '#FF8A3D', paper: '#FFF8EF' },
  { id: 'valentine', label: '情人节', blessing: '一心相许\n岁岁同心', month: 2, accent: '#BE185D', paper: '#FFF1F6' },
  { id: 'women', label: '妇女节', blessing: '春风有信\n芳华自来', month: 3, accent: '#DB2777', paper: '#FFF5F8' },
  { id: 'tree', label: '植树节', blessing: '一树新绿\n山河同春', month: 3, accent: '#166534', paper: '#F0FDF4' },
  { id: 'qingming', label: '清明', blessing: '细雨清明\n思念安然', month: 4, accent: '#0F766E', paper: '#F3FBF7' },
  { id: 'labor', label: '劳动节', blessing: '素手耕春\n岁月生香', month: 5, accent: '#0F766E', paper: '#F0FDFA' },
  { id: 'youth', label: '青年节', blessing: '少年意气\n正当时光', month: 5, accent: '#1D4ED8', paper: '#F0F9FF' },
  { id: 'nurse', label: '护士节', blessing: '素手护春\n心灯长明', month: 5, accent: '#0F766E', paper: '#F0FDFA' },
  { id: 'mother', label: '母亲节', blessing: '春晖寸草\n恩重如山', month: 5, accent: '#9F1239', paper: '#FFF1F2' },
  { id: 'child', label: '儿童节', blessing: '童心未改\n世界闪光', month: 6, accent: '#0284C7', paper: '#F0FDFF' },
  { id: 'duanwu', label: '端午', blessing: '粽香千里\n安康端阳', month: 6, accent: '#166534', paper: '#F0FDF4' },
  { id: 'father', label: '父亲节', blessing: '山高水长\n父爱无声', month: 6, accent: '#1E3A5F', paper: '#F8FAFC' },
  { id: 'party', label: '建党节', blessing: '星火初心\n山河向明', month: 7, accent: '#DC2626', paper: '#FEF2F2' },
  { id: 'army', label: '建军节', blessing: '旌旗猎猎\n山河无恙', month: 8, accent: '#3F6212', paper: '#F7FEE7' },
  { id: 'qixi', label: '七夕', blessing: '星河为证\n朝朝暮暮', month: 8, accent: '#7C3AED', paper: '#FAF5FF' },
  { id: 'zhongyuan', label: '中元', blessing: '灯火遥寄\n思念安稳', month: 8, accent: '#1E3A8A', paper: '#EFF6FF' },
  { id: 'teacher', label: '教师节', blessing: '桃李不言\n春风化雨', month: 9, accent: '#C2410C', paper: '#FFF7ED' },
  { id: 'midautumn', label: '中秋', blessing: '月满人间\n千里同心', month: 9, accent: '#FDE68A', paper: '#FFFBEB' },
  { id: 'national', label: '国庆', blessing: '山河锦绣\n家国同春', month: 10, accent: '#DC2626', paper: '#FFF7ED' },
  { id: 'chongyang', label: '重阳', blessing: '登高望远\n秋日安康', month: 10, accent: '#B45309', paper: '#FFFBEB' },
  { id: 'halloween', label: '万圣节', blessing: '夜色温柔\n奇趣满城', month: 10, accent: '#F97316', paper: '#FFF7ED' },
  { id: 'sale', label: '双十一', blessing: '好价如约\n尽兴而归', month: 11, accent: '#EF4444', paper: '#FFF7ED' },
  { id: 'dongzhi', label: '冬至', blessing: '一阳来复\n团圆暖冬', month: 12, accent: '#1D4ED8', paper: '#EFF6FF' },
  { id: 'christmas', label: '圣诞', blessing: '雪落有声\n心灯常亮', month: 12, accent: '#166534', paper: '#F0FDF4' },
  { id: 'countdown', label: '跨年', blessing: '旧岁可辞\n新程可期', month: 12, accent: '#7C3AED', paper: '#F8FAFC' },
]

function recruitmentWebUrl(id: string) {
  return `https://dr.mofangdianai.com/recruitment/${encodeURIComponent(id)}`
}

type Props = {
  text: string
  title?: string
  order: Record<string, unknown>
  onClose: () => void
}

export default function RecruitmentShareSheet({ text, title, order, onClose }: Props) {
  const orderId = String(order.id || '').trim()
  const webUrl = recruitmentWebUrl(orderId)
  const [tab, setTab] = useState<Tab>('web')
  const [webMode, setWebMode] = useState<WebMode>('link')
  const [edition, setEdition] = useState<Edition>('normal')
  const [copied, setCopied] = useState(false)
  const [shortLink, setShortLink] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [posterLoading, setPosterLoading] = useState(false)
  const [posterErr, setPosterErr] = useState('')
  const [posterStyleIndex, setPosterStyleIndex] = useState(0)
  const [themeId, setThemeId] = useState('')
  const [themeMonth, setThemeMonth] = useState(() => new Date().getMonth() + 1)
  const [posterAccent, setPosterAccent] = useState('#7c3aed')
  const [codeUrl, setCodeUrl] = useState('')
  const [codeErr, setCodeErr] = useState('')
  const [qrUrl, setQrUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!orderId) return
    const cached = resolveCachedApplyLink(order)
    const load = cached
      ? Promise.resolve(cached)
      : fetchMpApplyShortLink(orderId, String(order.title || ''))
          .then((out) => out.link || buildRecruitmentApplyLink(orderId))
          .catch(() => buildRecruitmentApplyLink(orderId))
    void load.then((link) => {
      if (!cancelled) setShortLink(link)
    })
    return () => {
      cancelled = true
    }
  }, [order, orderId])

  useEffect(() => {
    if (tab !== 'poster') return
    let cancelled = false
    setPosterLoading(true)
    setPosterErr('')
    const theme = FESTIVALS.find((item) => item.id === themeId)
    void buildRecruitmentSharePosterDataUrl(order, posterStyleIndex, theme
      ? {
          accentColor: theme.accent,
          accentLight: theme.paper,
          themeLabel: theme.label,
          blessing: theme.blessing,
          festivalUrl: `${FESTIVAL_CDN}/festival-${theme.id}.jpg?v=${FESTIVAL_VER}`,
          blessingUrl: `${FESTIVAL_CDN}/blessing-${theme.id}.jpg?v=blessing20261019c`,
        }
      : undefined)
      .then(({ dataUrl, design }) => {
        if (cancelled) return
        setPosterUrl(dataUrl)
        setPosterAccent(resolvePosterThemeColor(design))
      })
      .catch((e) => {
        if (!cancelled) setPosterErr(e instanceof Error ? e.message : '海报生成失败')
      })
      .finally(() => {
        if (!cancelled) setPosterLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab, order, posterStyleIndex, themeId])

  useEffect(() => {
    if (tab !== 'code' || !orderId) return
    let cancelled = false
    void fetchMpApplyWxacode(orderId)
      .then((out) => {
        if (!cancelled) setCodeUrl(out.dataUrl)
      })
      .catch(() => {
        if (!cancelled) setCodeErr('小程序码生成失败')
      })
    return () => {
      cancelled = true
    }
  }, [tab, orderId])

  useEffect(() => {
    if (tab !== 'web' || webMode !== 'qr' || !webUrl) return
    const theme = FESTIVALS.find((item) => item.id === themeId)
    const color = theme?.accent || '#EA580C'
    let cancelled = false
    void QRCode.toDataURL(webUrl, { width: 360, margin: 1, color: { dark: color, light: '#ffffff' } }).then((url) => {
      if (!cancelled) setQrUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [tab, webMode, webUrl, themeId])

  function pickColor(index: number) {
    if (posterLoading) return
    const preview = resolvePosterDesign(order, index)
    setThemeId('')
    setPosterStyleIndex(index)
    setPosterUrl('')
    setPosterAccent(resolvePosterThemeColor(preview))
  }

  function pickTheme(id: string) {
    setThemeId(id)
    setPosterUrl('')
    setQrUrl('')
  }

  function copyPayload() {
    const name = String(order.title || title || '招募').trim()
    if (webMode === 'short') {
      return edition === 'pure' ? shortLink : `【${name}】\n微信里点开即可报名：\n${shortLink}`
    }
    if (webMode === 'text') {
      return edition === 'pure' ? `${name}\n${webUrl}` : text || `${name}\n${webUrl}`
    }
    return edition === 'pure' ? webUrl : `【${name}】\n打开链接查看招募并报名：\n${webUrl}`
  }

  async function onCopy() {
    const ok = await copyTextToClipboard(copyPayload())
    setCopied(ok)
  }

  function onDownload(url: string, name: string) {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
  }

  const activeTheme = FESTIVALS.find((item) => item.id === themeId) || null
  const monthFestivals = FESTIVALS.filter((item) => item.month === themeMonth)
  const tabs: { id: Tab; label: string }[] = [
    { id: 'poster', label: '分享图' },
    { id: 'code', label: '小程序码' },
    { id: 'web', label: '网页链接' },
  ]
  const modes: { id: WebMode; label: string }[] = [
    { id: 'link', label: '链接' },
    { id: 'text', label: '文字+链接' },
    { id: 'qr', label: '图文二维码' },
    { id: 'short', label: '小程序短链' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl panel-card p-4 sm:p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recruitment-share-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="recruitment-share-title" className="text-base font-semibold text-[var(--shell-text)]">
              生成分享图
            </h3>
            {title ? <p className="text-sm text-[var(--shell-muted)] mt-1 truncate">{title}</p> : null}
          </div>
          <button type="button" className="shrink-0 text-2xl leading-none text-[var(--shell-muted)]" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="mt-4 flex gap-1 border-b border-[var(--shell-border)]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`flex-1 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-[var(--shell-muted)]'
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'poster' ? (
          <div className="mt-4 flex justify-center">
            {posterLoading ? (
              <div className="w-[225px] h-[360px] rounded-xl bg-slate-100 flex items-center justify-center text-sm text-slate-500">生成海报中…</div>
            ) : posterUrl ? (
              <img src={posterUrl} alt="招募分享海报" className="max-w-[225px] w-full rounded-xl border border-[var(--shell-border)]" />
            ) : (
              <p className="text-sm text-amber-600">{posterErr || '海报生成失败'}</p>
            )}
          </div>
        ) : null}

        {tab === 'code' ? (
          <div className="mt-4 flex flex-col items-center">
            {codeUrl ? (
              <div
                className="relative rounded-2xl p-3"
                style={{
                  backgroundColor: activeTheme?.accent || COLORS.find((c) => c.index === posterStyleIndex)?.color || '#6366F1',
                  backgroundImage: activeTheme
                    ? `url(${FESTIVAL_CDN}/festival-${activeTheme.id}.jpg?v=${FESTIVAL_VER})`
                    : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <img
                  src={codeUrl}
                  alt="小程序码"
                  className="relative h-52 w-52 rounded-xl bg-white object-contain"
                />
              </div>
            ) : (
              <p className="text-sm text-amber-600">{codeErr || '正在生成小程序码…'}</p>
            )}
            <p className="mt-2 text-xs text-[var(--shell-muted)]">长按识别小程序码报名</p>
          </div>
        ) : null}

        {tab === 'web' ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-xl bg-orange-50 px-3 py-2 text-sm leading-relaxed text-orange-700">
              该链接可放在公众号菜单、阅读原文、网站、论坛或微博等所有可以插入网页链接的位置。达人打开后进入星选招募详情报名。
            </p>
            {webMode === 'qr' && qrUrl ? (
              <div className="flex justify-center">
                <div
                  className="relative overflow-hidden rounded-2xl p-4"
                  style={{
                    backgroundColor: '#fff',
                    backgroundImage: activeTheme ? `url(${FESTIVAL_CDN}/festival-${activeTheme.id}.jpg?v=${FESTIVAL_VER})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  {activeTheme ? <div className="pointer-events-none absolute inset-4 rounded-xl bg-white/55" /> : null}
                  <img src={qrUrl} alt="网页二维码" className={`relative mx-auto h-52 w-52 ${activeTheme ? 'mix-blend-multiply' : 'bg-white'}`} />
                </div>
              </div>
            ) : (
              <p className="break-all rounded-xl bg-slate-100 px-3 py-3 text-sm text-[var(--shell-text)]">
                {webMode === 'short' ? shortLink || '短链生成中…' : webUrl}
              </p>
            )}
            <div className="flex gap-4 text-sm">
              <button type="button" className={edition === 'normal' ? 'font-semibold' : 'text-[var(--shell-muted)]'} onClick={() => setEdition('normal')}>
                普通版
              </button>
              <button type="button" className={edition === 'pure' ? 'font-semibold' : 'text-[var(--shell-muted)]'} onClick={() => setEdition('pure')}>
                纯净版（无额外说明）
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {modes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`rounded-lg border px-2 py-2 text-xs ${webMode === m.id ? 'border-blue-600 text-blue-600' : 'border-[var(--shell-border)]'}`}
                  onClick={() => setWebMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === 'web' && webMode !== 'qr' ? null : (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-slate-100 p-2">
              <p className="mb-2 px-1 text-[11px] text-slate-500">月份</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <button
                    key={month}
                    type="button"
                    className={`rounded-full px-2.5 py-1 text-xs ${themeMonth === month ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                    onClick={() => setThemeMonth(month)}
                  >
                    {month}月
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-2">
              <p className="mb-2 px-1 text-[11px] text-orange-700">当月节日</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={`rounded-full px-3 py-1 text-xs ${themeId ? 'text-slate-600' : 'bg-orange-600 text-white'}`} onClick={() => pickTheme('')}>经典</button>
                {monthFestivals.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs ${themeId === item.id ? 'border-orange-600 bg-orange-600 text-white' : 'border-orange-200 bg-white text-slate-700'}`}
                    onClick={() => pickTheme(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'web' ? null : (
        <div className="mt-4 flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.id}
              className={`h-8 w-8 rounded-md border-2 ${posterStyleIndex === c.index ? 'border-slate-900' : 'border-transparent'}`}
              style={{ background: c.color }}
              onClick={() => pickColor(c.index)}
            />
          ))}
        </div>
        )}

        <div className="mt-4 flex gap-2">
          {tab === 'web' && webMode !== 'qr' ? (
            <button type="button" className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white" onClick={() => void onCopy()}>
              {copied ? '已复制' : '复制'}
            </button>
          ) : (
            <button
              type="button"
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              disabled={tab === 'poster' ? !posterUrl : tab === 'code' ? !codeUrl : !qrUrl}
              onClick={() =>
                onDownload(
                  tab === 'poster' ? posterUrl : tab === 'code' ? codeUrl : qrUrl,
                  tab === 'code' ? 'recruit-wxacode.png' : tab === 'web' ? 'recruit-qr.png' : 'recruit-poster.png',
                )
              }
            >
              {tab === 'poster' ? '保存分享图' : tab === 'code' ? '保存小程序码' : '保存二维码'}
            </button>
          )}
          <button type="button" className="rounded-xl border border-[var(--shell-border)] px-4 py-2.5 text-sm" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
