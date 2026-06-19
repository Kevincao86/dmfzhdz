import { Sparkles } from 'lucide-react'

/** 未开通用户：增值服务需运营在 PR 用户库开通 */
export default function AddonComingSoon() {
  return (
    <div className="mx-auto flex min-h-[420px] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300">
        <Sparkles className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="text-xl font-bold text-[var(--shell-text)]">增值服务即将开放使用</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--shell-muted)]">
        短视频 AI 处理、AI 文章与话题、数字人口播等为<strong className="font-medium text-[var(--shell-text)]">收费增值能力</strong>
        ，需由灵祺运营在后台为您开通后方可使用。
      </p>
      <p className="mt-2 text-sm text-[var(--shell-muted)]">
        正式开放后将支持在线开通与计费。如有合作意向请联系灵祺运营申请开通。
      </p>
      <div className="mt-8 rounded-xl border border-dashed border-[var(--shell-border)] bg-[var(--panel-card)] px-5 py-4 text-left text-xs text-[var(--shell-muted)]">
        <p className="font-medium text-[var(--shell-text)]">包含能力</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>短视频 AI 处理（参考画面 / 生成 / 灵祺 AI 云剪）</li>
          <li>AI 文章与话题（抖音来客文案辅助）</li>
          <li>数字人口播（TTS + 口播视频）</li>
        </ul>
      </div>
    </div>
  )
}
