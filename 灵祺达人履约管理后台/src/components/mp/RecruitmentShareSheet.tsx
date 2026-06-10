import { useState } from 'react'
import { copyTextToClipboard } from '../../lib/copyTextToClipboard'

type Props = {
  text: string
  title?: string
  onClose: () => void
}

export default function RecruitmentShareSheet({ text, title, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const [copyErr, setCopyErr] = useState(false)

  async function onCopy() {
    const ok = await copyTextToClipboard(text)
    if (ok) {
      setCopied(true)
      setCopyErr(false)
      return
    }
    setCopyErr(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl panel-card p-4 sm:p-5 shadow-xl"
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

        <textarea
          readOnly
          value={text}
          rows={14}
          className="mt-4 w-full rounded-xl border border-[var(--shell-border)] bg-[var(--shell-bg)] px-3 py-2.5 text-sm leading-relaxed text-[var(--shell-text)] resize-none"
          onFocus={(e) => e.currentTarget.select()}
        />

        {copied ? (
          <p className="mt-3 text-sm text-emerald-600">已复制到剪贴板，可粘贴到微信群发送给达人。</p>
        ) : copyErr ? (
          <p className="mt-3 text-sm text-amber-600">
            无法自动复制，请点按上方文案全选后手动复制，或再点「复制文案」。
          </p>
        ) : (
          <p className="mt-3 text-sm text-[var(--shell-muted)]">
            请点「复制文案」或全选上方文字后手动复制，粘贴到微信群发送给达人。
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="flex-1 min-w-[8rem] py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500"
            onClick={() => void onCopy()}
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
      </div>
    </div>
  )
}
