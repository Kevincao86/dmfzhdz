import { useEffect, useState } from 'react'
import type { IceApplicantState } from '../../lib/mpSync/iceTaskRuntime'
import {
  confirmIceTask,
  resolveIceDownloadUrl,
  submitIceDouyin,
} from '../../lib/mpSync/iceTaskRuntime'

type Props = {
  mpOrderId: string
  state: IceApplicantState
  onRefresh: () => void | Promise<void>
}

export default function IceTaskPanel({ mpOrderId, state, onRefresh }: Props) {
  const [douyinUrl, setDouyinUrl] = useState(state.douyinPublishUrl)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setDouyinUrl(state.douyinPublishUrl)
  }, [state.douyinPublishUrl])

  async function onConfirm(action: 'confirm' | 'reject') {
    if (!state.applicantId) {
      window.alert('请先认领任务')
      return
    }
    if (action === 'reject') {
      const ok = window.confirm('拒绝后名额将释放，是否继续？')
      if (!ok) return
    }
    setConfirming(true)
    try {
      await confirmIceTask(mpOrderId, state.applicantId, action)
      window.alert(action === 'confirm' ? '已确认接收' : '已拒绝任务')
      await onRefresh()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setConfirming(false)
    }
  }

  async function onCopyDownload() {
    const full = resolveIceDownloadUrl(state.assignedVideoUrl)
    if (!full) {
      window.alert('成片尚未分配，请稍后再试')
      return
    }
    try {
      await navigator.clipboard.writeText(full)
      window.alert('下载链接已复制，请在浏览器中打开下载后发布至抖音。')
    } catch {
      window.prompt('请复制下载链接：', full)
    }
  }

  async function onSubmitDouyin() {
    const url = douyinUrl.trim()
    if (!url) {
      window.alert('请填写抖音作品链接')
      return
    }
    if (!state.applicantId) {
      window.alert('请先报名认领')
      return
    }
    setSubmitting(true)
    try {
      await submitIceDouyin(mpOrderId, state.applicantId, url)
      window.alert('AI 核查通过')
      await onRefresh()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (state.iceRejected) {
    return (
      <section className="surface-card rounded-xl border border-slate-200 p-4 space-y-2">
        <h3 className="font-medium text-slate-900">云剪任务</h3>
        <p className="text-sm text-slate-600">您已拒绝该云剪任务，可返回大厅查看其他任务。</p>
      </section>
    )
  }

  if (state.icePendingConfirm) {
    return (
      <section className="surface-card rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
        <h3 className="font-medium text-amber-950">待确认接收</h3>
        <p className="text-sm text-amber-900/90">请确认是否接受该云剪投放任务；拒绝后名额将释放。</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={confirming}
            className="flex-1 min-w-[8rem] py-3 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-500 disabled:opacity-60"
            onClick={() => void onConfirm('confirm')}
          >
            {confirming ? '处理中…' : '确认接收'}
          </button>
          <button
            type="button"
            disabled={confirming}
            className="flex-1 min-w-[8rem] py-3 rounded-xl border border-slate-300 bg-white text-slate-800 font-medium hover:bg-slate-50 disabled:opacity-60"
            onClick={() => void onConfirm('reject')}
          >
            拒绝
          </button>
        </div>
      </section>
    )
  }

  if (state.assignedVideoUrl) {
    return (
      <section className="surface-card rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
        <div>
          <h3 className="font-medium text-emerald-900">✓ 已分配成片</h3>
          <p className="text-sm text-emerald-800/90 mt-1">{state.assignedVideoLabel || '云剪成片'}</p>
        </div>
        <button
          type="button"
          className="w-full py-3 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-500"
          onClick={() => void onCopyDownload()}
        >
          复制下载链接
        </button>
        {state.iceVerified ? (
          <p className="text-sm font-medium text-emerald-700">✓ AI 核查已通过</p>
        ) : (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-slate-600">发布抖音后粘贴作品链接：</p>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              placeholder="粘贴抖音分享口令或作品链接"
              value={douyinUrl}
              onChange={(e) => setDouyinUrl(e.target.value)}
            />
            <button
              type="button"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-500 disabled:opacity-60"
              onClick={() => void onSubmitDouyin()}
            >
              {submitting ? '提交中…' : '提交链接 · AI 核查'}
            </button>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="surface-card rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
      <h3 className="font-medium text-emerald-900">✓ 认领成功</h3>
      <p className="text-sm text-emerald-800/90">等待 PR 分配成片，分配后可在此下载并回传抖音链接。</p>
    </section>
  )
}
