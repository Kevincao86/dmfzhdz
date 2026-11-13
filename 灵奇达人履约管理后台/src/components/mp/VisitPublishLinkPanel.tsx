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
      <div className="rounded-2xl border-2 border-orange-500 bg-orange-50 p-4 space-y-3">
      <p className="text-sm font-medium text-orange-800">
        视频已通过审核。把已发布的作品链接粘贴到下面。
      </p>
      {hint ? <p className="text-sm text-amber-800 rounded-lg bg-amber-100 px-3 py-2">{hint}</p> : null}
      {publishPhase === 'link_failed' ? (
        <p className="text-sm text-red-700 rounded-lg bg-red-50 px-3 py-2">上次链接未通过，请重新提交</p>
      ) : null}
      <textarea
        className="w-full min-h-[120px] rounded-xl border-2 border-orange-300 bg-white px-4 py-3 text-base text-slate-900"
        placeholder={publishLinkPlaceholder(platform)}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      <BtnPrimary disabled={busy} onClick={() => void onSubmit()}>
        {busy ? 'AI 核查中…' : publishPhase === 'link_failed' ? '重新提交链接' : '提交链接 · AI 核查'}
      </BtnPrimary>
      </div>
    </FormSection>
  )
}
