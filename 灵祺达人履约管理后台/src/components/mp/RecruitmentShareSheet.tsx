import { useEffect, useState } from 'react'
import { copyTextToClipboard } from '../../lib/copyTextToClipboard'
import {
  buildRecruitmentApplyLink,
  resolveCachedApplyLink,
} from '../../lib/mpSync/recruitmentShareCopy'
import {
  buildRecruitmentSharePosterDataUrl,
  normalizePosterStyleIndex,
} from '../../lib/mpSync/recruitmentSharePoster'
import { fetchMpApplyShortLink } from '../../lib/mpApi'

type Tab = 'copy' | 'poster' | 'link'

type Props = {
  text: string
  title?: string
  order: Record<string, unknown>
  onClose: () => void
}

export default function RecruitmentShareSheet({ text, title, order, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('copy')
  const [copied, setCopied] = useState(false)
  const [copyErr, setCopyErr] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [applyLink, setApplyLink] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [posterLoading, setPosterLoading] = useState(false)
  const [posterErr, setPosterErr] = useState('')
  const [posterStyleIndex, setPosterStyleIndex] = useState(0)
  const [posterStyleLabel, setPosterStyleLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    const id = String(order.id || '').trim()
    if (!id) return
    let link = resolveCachedApplyLink(order)
    if (link) {
      setApplyLink(link)
      return
    }
    void fetchMpApplyShortLink(id, String(order.title || ''))
      .then((out) => {
        if (!cancelled) setApplyLink(out.link || buildRecruitmentApplyLink(id))
      })
      .catch(() => {
        if (!cancelled) setApplyLink(buildRecruitmentApplyLink(id))
      })
    return () => {
      cancelled = true
    }
  }, [order])

  useEffect(() => {
    if (tab !== 'poster') return
    let cancelled = false
    setPosterLoading(true)
    setPosterErr('')
    void buildRecruitmentSharePosterDataUrl(order, posterStyleIndex)
      .then(({ dataUrl, design }) => {
        if (!cancelled) {
          setPosterUrl(dataUrl)
          setPosterStyleLabel(design.styleLabel || '')
        }
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
  }, [tab, order, posterStyleIndex])

  function onSwitchPosterStyle() {
    if (posterLoading) return
    const next = normalizePosterStyleIndex(posterStyleIndex + 1)
    setPosterStyleIndex(next)
    setPosterUrl('')
    setPosterErr('')
  }

  async function onCopyText() {
    const ok = await copyTextToClipboard(text)
    if (ok) {
      setCopied(true)
      setCopyErr(false)
      return
    }
    setCopyErr(true)
  }

  async function onCopyLink() {
    const id = String(order.id || '').trim()
    const link = applyLink || buildRecruitmentApplyLink(id)
    const ok = await copyTextToClipboard(link)
    if (ok) setLinkCopied(true)
  }

  function onDownloadPoster() {
    if (!posterUrl) return
    const a = document.createElement('a')
    a.href = posterUrl
    a.download = `recruit-poster-${String(order.id || 'share').slice(0, 12)}.png`
    a.click()
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'copy', label: '文案+链接' },
    { id: 'poster', label: '海报' },
    { id: 'link', label: '链接' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
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
              分享招募
            </h3>
            {title ? <p className="text-sm text-[var(--shell-muted)] mt-1 truncate">{title}</p> : null}
          </div>
          <button
            type="button"
            className="shrink-0 text-2xl leading-none text-[var(--shell-muted)] hover:text-[var(--shell-text)]"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex gap-1 border-b border-[var(--shell-border)]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-violet-600 text-violet-600'
                  : 'border-transparent text-[var(--shell-muted)] hover:text-[var(--shell-text)]'
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'copy' ? (
          <>
            <textarea
              readOnly
              value={text}
              rows={12}
              className="mt-4 w-full rounded-xl border border-[var(--shell-border)] bg-[var(--shell-bg)] px-3 py-2.5 text-sm leading-relaxed text-[var(--shell-text)] resize-none"
              onFocus={(e) => e.currentTarget.select()}
            />
            {copied ? (
              <p className="mt-3 text-sm text-emerald-600">已复制到剪贴板，可粘贴到微信群发送给达人。</p>
            ) : copyErr ? (
              <p className="mt-3 text-sm text-amber-600">无法自动复制，请全选上方文案后手动复制。</p>
            ) : (
              <p className="mt-3 text-sm text-[var(--shell-muted)]">复制完整招募文案与报名指引，粘贴到微信群即可。</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="flex-1 min-w-[8rem] py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500"
                onClick={() => void onCopyText()}
              >
                复制文案
              </button>
              <button
                type="button"
                className="px-4 py-2.5 rounded-xl border border-[var(--shell-border)] text-sm text-[var(--shell-text)]"
                onClick={onClose}
              >
                关闭
              </button>
            </div>
          </>
        ) : null}

        {tab === 'poster' ? (
          <>
            <div className="mt-4 flex justify-center">
              {posterLoading ? (
                <div className="w-[225px] h-[360px] rounded-xl bg-slate-100 animate-pulse flex items-center justify-center text-sm text-slate-500">
                  生成海报中…
                </div>
              ) : posterUrl ? (
                <img
                  src={posterUrl}
                  alt="招募分享海报"
                  className="max-w-[225px] w-full rounded-xl border border-[var(--shell-border)] shadow-sm"
                />
              ) : (
                <p className="text-sm text-amber-600">{posterErr || '海报生成失败，请稍后重试'}</p>
              )}
            </div>
            {(posterUrl || posterStyleLabel) ? (
              <div className="mt-2 flex items-center justify-between gap-3 px-1">
                <p className="text-xs text-[var(--shell-muted)]">
                  {posterStyleLabel ? `当前样式：${posterStyleLabel}` : null}
                </p>
                <button
                  type="button"
                  className="text-sm font-medium text-violet-600 hover:text-violet-500 disabled:opacity-50"
                  disabled={posterLoading}
                  onClick={onSwitchPosterStyle}
                >
                  换个样式
                </button>
              </div>
            ) : null}
            <p className="mt-3 text-sm text-[var(--shell-muted)] text-center">
              保存海报后发到朋友圈或微信群，达人长按识别二维码即可报名。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!posterUrl}
                className="flex-1 min-w-[8rem] py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50"
                onClick={onDownloadPoster}
              >
                保存海报
              </button>
              <button
                type="button"
                className="px-4 py-2.5 rounded-xl border border-[var(--shell-border)] text-sm text-[var(--shell-text)]"
                onClick={onClose}
              >
                关闭
              </button>
            </div>
          </>
        ) : null}

        {tab === 'link' ? (
          <>
            <div className="mt-4 rounded-xl border border-[var(--shell-border)] bg-[var(--shell-bg)] px-3 py-3">
              <p className="text-xs text-[var(--shell-muted)] mb-2">报名链接（微信群可点击）</p>
              <p className="text-sm break-all text-[var(--shell-text)]">
                {applyLink || buildRecruitmentApplyLink(String(order.id || ''))}
              </p>
            </div>
            {linkCopied ? (
              <p className="mt-3 text-sm text-emerald-600">链接已复制。</p>
            ) : (
              <p className="mt-3 text-sm text-[var(--shell-muted)]">仅复制报名链接，适合单独发送。</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="flex-1 min-w-[8rem] py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500"
                onClick={() => void onCopyLink()}
              >
                复制链接
              </button>
              <button
                type="button"
                className="px-4 py-2.5 rounded-xl border border-[var(--shell-border)] text-sm text-[var(--shell-text)]"
                onClick={onClose}
              >
                关闭
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
