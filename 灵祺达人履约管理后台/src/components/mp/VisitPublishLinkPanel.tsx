import { useState } from 'react'
import { clearMpRegistryCache } from '../../lib/mpApi'
import {
  publishLinkPlaceholder,
  submitVisitPublishLink,
} from '../../lib/mpSync/recruitmentPublishLink'
import { BtnPrimary, FormSection } from '../ui/MockupLayouts'

type Props = {
  mpOrderId: string
  applicantId: string
  platform?: string
  publishPhase?: string
  initialUrl?: string
  hint?: string
  onRefresh: () => void
}

export default function VisitPublishLinkPanel({
  mpOrderId,
  applicantId,
  platform,
  publishPhase,
  initialUrl = '',
  hint,
  onRefresh,
}: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function onSubmit() {
    const text = String(url || '').trim()
    if (!text) {
      setErr('请填写发布链接')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await submitVisitPublishLink(mpOrderId, applicantId, text)
      clearMpRegistryCache()
      window.alert('AI 核查通过，订单已完结')
      onRefresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormSection title="回传发布链接">
      <p className="text-xs text-[var(--shell-muted)]">
        视频已通过 PR 审核。请发布作品并回传平台链接，AI 将核查标题与内容与商单的关联度，通过后订单完结。
      </p>
      {hint ? <p className="text-xs text-amber-700 rounded-lg bg-amber-50 px-3 py-2">{hint}</p> : null}
      {publishPhase === 'link_failed' ? (
        <p className="text-xs text-red-600 rounded-lg bg-red-50 px-3 py-2">上次链接未通过 AI 核查，请重新提交</p>
      ) : null}
      <textarea
        className="w-full min-h-[88px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
        placeholder={publishLinkPlaceholder(platform)}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      <BtnPrimary disabled={busy} onClick={() => void onSubmit()}>
        {busy ? 'AI 核查中…' : publishPhase === 'link_failed' ? '重新提交链接' : '提交链接 · AI 核查'}
      </BtnPrimary>
    </FormSection>
  )
}
