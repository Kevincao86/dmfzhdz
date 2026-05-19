import { BookOpen, ExternalLink } from 'lucide-react'
import { cn } from '../../cn'
import {
  DOUYIN_BIND_ERP_STEP,
  DOUYIN_BIND_GUIDE_PHASES,
  DOUYIN_BIND_GUIDE_STEPS,
} from './douyinBindGuideSteps'

type Props = {
  className?: string
  /** 嵌入弹窗时收紧外边距 */
  compact?: boolean
}

export default function DouyinBindGuide({ className, compact }: Props) {
  const stepsByPhase = DOUYIN_BIND_GUIDE_PHASES.map((phase) => ({
    ...phase,
    steps: DOUYIN_BIND_GUIDE_STEPS.filter((s) => s.phase === phase.id),
  }))

  return (
    <div
      className={cn(
        'text-sm text-gray-800',
        compact ? 'space-y-5' : 'space-y-6',
        className,
      )}
    >
      <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-blue-950">
        <div className="flex items-start gap-2">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1 text-sm leading-relaxed">
            <p className="font-medium">绑定前请准备</p>
            <p>
              抖音来客超级管理员账号、抖音开放平台企业账号，以及约 15～30 分钟完成应用创建、能力开通与 IP
              白名单配置。下列步骤与截图一一对应，建议按顺序操作。
            </p>
          </div>
        </div>
      </div>

      {stepsByPhase
        .filter((phase) => phase.steps.length > 0)
        .map((phase) => (
        <section key={phase.id} className="space-y-4">
          <h4 className="text-base font-semibold text-gray-900">{phase.label}</h4>
          {phase.steps.map((step) => {
            const stepNo = DOUYIN_BIND_GUIDE_STEPS.findIndex((s) => s.id === step.id) + 1
            return (
              <article
                key={step.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    步骤 {stepNo}
                  </p>
                  <h5 className="mt-0.5 font-semibold text-gray-900">{step.title}</h5>
                </div>
                <div className="grid gap-4 p-4 lg:grid-cols-2 lg:items-start">
                  <ul className="list-inside list-decimal space-y-2 text-sm leading-relaxed text-gray-700">
                    {step.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <div className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                    <img
                      src={step.imageSrc}
                      alt={step.imageAlt}
                      className="h-auto w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                </div>
                {step.note ? (
                  <p className="border-t border-gray-100 bg-amber-50/60 px-4 py-2 text-xs leading-relaxed text-amber-950">
                    说明：{step.note}
                  </p>
                ) : null}
              </article>
            )
          })}
        </section>
      ))}

      <section className="overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/50">
        <div className="border-b border-indigo-100 px-4 py-3">
          <h4 className="font-semibold text-indigo-950">三、墨典 ERP 绑定</h4>
        </div>
        <div className="space-y-2 px-4 py-3 text-sm leading-relaxed text-indigo-950">
          <p className="font-medium">{DOUYIN_BIND_ERP_STEP.title}</p>
          <ul className="list-inside list-decimal space-y-1.5">
            {DOUYIN_BIND_ERP_STEP.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      </section>

      <p className="text-xs leading-relaxed text-gray-500">
        官方文档：
        <a
          href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/auth_with_bind"
          target="_blank"
          rel="noreferrer"
          className="ml-1 inline-flex items-center gap-0.5 text-blue-600 hover:underline"
        >
          抖音来客 · 能力与门店绑定
          <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  )
}
