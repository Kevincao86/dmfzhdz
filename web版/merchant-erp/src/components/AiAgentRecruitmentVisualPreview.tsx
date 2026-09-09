import { Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAiAgent } from '../context/AiAgentContext'
import type { AiRecruitmentBriefPreview, RecruitContentForm } from '../lib/aiAgentTypes'
import RecruitmentCityPickerModal, {
  RecruitmentCityField,
} from './recruitment/RecruitmentCityPickerModal'
import {
  buildRegionFromCityState,
  parseRegionToCityState,
} from '../lib/recruitmentCityPicker'
import {
  RECRUIT_CONTENT_FORM_OPTIONS,
  RECRUIT_WIZARD_STEP_META,
  recruitContentFormLabel,
  recruitPlatformLabel,
  recruitWizardStepOf,
  summarizeRecruitWizardBudget,
  summarizeRecruitWizardScope,
} from '../lib/aiAgentRecruitmentWizard'
import { LOCAL_LIFE_KOL_COMMISSION_MAX_PCT, LOCAL_LIFE_KOL_COMMISSION_MIN_PCT } from '../lib/localLifeKolCommission'

export function AiAgentRecruitmentVisualPreview({
  brief,
  previewMessageId,
}: {
  brief: AiRecruitmentBriefPreview
  previewMessageId: string
}) {
  const { patchRecruitWizard } = useAiAgent()
  const step = recruitWizardStepOf(brief)
  const meta = RECRUIT_WIZARD_STEP_META[step]
  const scope =
    brief.wizardScope ??
    ({
      platform: brief.platform === '小红书' ? '小红书' : '抖音',
      city: '',
      storeName: '',
      mainProductName: brief.mainProductName,
      contentForm: 'instore',
    } as const)
  const budget = brief.wizardBudget
  const shoot = brief.wizardShoot
  const [cityPickerOpen, setCityPickerOpen] = useState(false)
  const cityState = scope.city.trim()
    ? parseRegionToCityState(scope.city)
    : { cityNational: false, selectedCities: [] }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-violet-900">
          第 {step}/4 步 · {meta.title}
        </p>
        <div className="flex gap-1" aria-hidden>
          {([1, 2, 3, 4] as const).map((n) => (
            <span
              key={n}
              className={
                n <= step ? 'h-1.5 w-6 rounded-full bg-violet-500' : 'h-1.5 w-6 rounded-full bg-violet-200'
              }
            />
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-500">{meta.hint}</p>

      {step > 1 && scope ? (
        <p className="rounded-lg bg-white/80 px-3 py-2 text-[11px] text-slate-600 ring-1 ring-violet-100">
          已确认：{summarizeRecruitWizardScope(scope)}
        </p>
      ) : null}
      {step > 2 && budget ? (
        <p className="rounded-lg bg-white/80 px-3 py-2 text-[11px] text-slate-600 ring-1 ring-violet-100">
          已确认：{summarizeRecruitWizardBudget(budget)}
        </p>
      ) : null}

      {step === 1 && scope ? (
        <div className="space-y-3 rounded-xl border border-violet-100 bg-white p-3">
          <Field label="主推套餐">
            <input
              className={inputClass}
              value={scope.mainProductName}
              onChange={(e) =>
                patchRecruitWizard(previewMessageId, {
                  wizardScope: { ...scope, mainProductName: e.target.value },
                  mainProductName: e.target.value,
                })
              }
            />
          </Field>
          <Field label="平台">
            <div className="flex flex-wrap gap-2">
              {(['抖音', '小红书'] as const).map((p) => (
                <ChoiceChip
                  key={p}
                  active={scope.platform === p}
                  onClick={() =>
                    patchRecruitWizard(previewMessageId, {
                      wizardScope: { ...scope, platform: p },
                      platform: recruitPlatformLabel(p),
                    })
                  }
                >
                  {recruitPlatformLabel(p)}
                </ChoiceChip>
              ))}
            </div>
          </Field>
          <Field label="招募城市">
            <RecruitmentCityField
              cityNational={cityState.cityNational}
              selectedCities={cityState.selectedCities}
              onClick={() => setCityPickerOpen(true)}
            />
            <p className="mt-1 text-[10px] text-slate-400">可多选城市；选「全国」则不限地域（与星选发招募一致）</p>
          </Field>
          <Field label="门店">
            <input
              className={inputClass}
              placeholder="可留空"
              value={scope.storeName}
              onChange={(e) =>
                patchRecruitWizard(previewMessageId, {
                  wizardScope: { ...scope, storeName: e.target.value },
                })
              }
            />
          </Field>
          <Field label="内容形式">
            <div className="flex flex-wrap gap-2">
              {RECRUIT_CONTENT_FORM_OPTIONS.map((opt) => (
                <ChoiceChip
                  key={opt.id}
                  active={scope.contentForm === opt.id}
                  onClick={() =>
                    patchRecruitWizard(previewMessageId, {
                      wizardScope: { ...scope, contentForm: opt.id as RecruitContentForm },
                    })
                  }
                >
                  {opt.label}
                </ChoiceChip>
              ))}
            </div>
          </Field>
        </div>
      ) : null}

      {step === 2 && budget ? (
        <div className="space-y-3 rounded-xl border border-violet-100 bg-white p-3">
          {brief.wizardBudgetStatus === 'loading' ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
              正在按城市测算档位…
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="总预算（元）">
                  <input
                    type="number"
                    min={500}
                    className={inputClass}
                    value={budget.budgetYuan}
                    onChange={(e) =>
                      patchRecruitWizard(previewMessageId, {
                        wizardBudget: { ...budget, budgetYuan: Number(e.target.value) || 0 },
                      })
                    }
                  />
                </Field>
                <Field label="计划人数">
                  <input
                    type="number"
                    min={1}
                    max={80}
                    className={inputClass}
                    value={budget.headcount}
                    onChange={(e) =>
                      patchRecruitWizard(previewMessageId, {
                        wizardBudget: { ...budget, headcount: Number(e.target.value) || 1 },
                      })
                    }
                  />
                </Field>
                <Field label={`佣金（${LOCAL_LIFE_KOL_COMMISSION_MIN_PCT}–${LOCAL_LIFE_KOL_COMMISSION_MAX_PCT}%）`}>
                  <input
                    type="number"
                    min={LOCAL_LIFE_KOL_COMMISSION_MIN_PCT}
                    max={LOCAL_LIFE_KOL_COMMISSION_MAX_PCT}
                    className={inputClass}
                    value={budget.commissionPct}
                    onChange={(e) =>
                      patchRecruitWizard(previewMessageId, {
                        wizardBudget: { ...budget, commissionPct: Number(e.target.value) || 3 },
                      })
                    }
                  />
                </Field>
              </div>
              {budget.allocation ? (
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  {([
                    ['V3', budget.allocation.v3],
                    ['V4', budget.allocation.v4],
                    ['V5', budget.allocation.v5],
                    ['V5+', budget.allocation.v5plus],
                  ] as const).map(([label, n]) => (
                    <div key={label} className="rounded-md bg-slate-50 px-1 py-1.5 ring-1 ring-slate-100">
                      <p className="text-[9px] text-slate-500">{label}</p>
                      <p className="text-sm font-semibold tabular-nums text-slate-900">{n}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {budget.allocation?.costHint ? (
                <p className="text-[11px] text-slate-500">{budget.allocation.costHint}</p>
              ) : null}
              <p className="text-[10px] text-slate-400">改预算或人数后，点下一步会按新数字重算档位。</p>
            </>
          )}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3 rounded-xl border border-violet-100 bg-white p-3">
          {brief.wizardShootStatus === 'loading' || !shoot ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
              正在按前两步写拍摄要点…
            </div>
          ) : (
            <>
              <ReqBlock title="推广目标" text={shoot.goal} />
              <ReqBlock title="目标人群" text={shoot.audience} />
              <ReqBlock title="内容切入" text={shoot.storyAngle} />
              <ReqList title="必讲卖点" items={shoot.sellingPoints} />
              <ReqList title="必拍镜头" items={shoot.mustShoot} />
              <ReqList title="口播结构" items={shoot.talkTrack} />
              <ReqBlock title="主钩子" text={shoot.hooks[0]} />
              <ReqBlock title="备选钩子" text={shoot.hooks[1]} />
              <ReqBlock title="时长建议" text={shoot.durationHint} />
              <ReqBlock title="交付物" text={shoot.deliverables} />
              <ReqBlock title="转化动作" text={shoot.convertAction} />
              <ReqBlock title="到店配合" text={shoot.storeCoop} />
              <ReqList
                title="禁忌"
                items={shoot.tabooItems?.length ? shoot.tabooItems : shoot.taboo ? [shoot.taboo] : []}
              />
              {shoot.hashtags?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {shoot.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-800 ring-1 ring-violet-100"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="报名截止">
                  <input
                    type="date"
                    className={inputClass}
                    value={shoot.applyDeadline}
                    onChange={(e) =>
                      patchRecruitWizard(previewMessageId, {
                        wizardShoot: { ...shoot, applyDeadline: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="成片截止">
                  <input
                    type="date"
                    className={inputClass}
                    value={shoot.deliverDeadline}
                    onChange={(e) =>
                      patchRecruitWizard(previewMessageId, {
                        wizardShoot: { ...shoot, deliverDeadline: e.target.value },
                      })
                    }
                  />
                </Field>
              </div>
            </>
          )}
        </div>
      ) : null}

      {step === 4 && scope && budget ? (
        <div className="space-y-2 rounded-xl border border-violet-100 bg-white p-3 text-sm text-slate-700">
          <Row label="投放" value={summarizeRecruitWizardScope(scope)} />
          <Row label="预算" value={summarizeRecruitWizardBudget(budget)} />
          {shoot ? (
            <>
              <Row
                label="档期"
                value={`报名至 ${shoot.applyDeadline}，成片至 ${shoot.deliverDeadline}`}
              />
              <Row label="形式" value={recruitContentFormLabel(scope.contentForm)} />
              {shoot.deliverables ? <Row label="交付" value={shoot.deliverables} /> : null}
              {shoot.convertAction ? <Row label="转化" value={shoot.convertAction} /> : null}
            </>
          ) : null}
          <p className="pt-1 text-[11px] text-slate-500">
            确认后发到星选大厅，由达人报名；不会直接私信达人。
          </p>
        </div>
      ) : null}

      {brief.enrichError ? <p className="text-center text-xs text-amber-700">{brief.enrichError}</p> : null}

      <RecruitmentCityPickerModal
        open={cityPickerOpen}
        value={cityState}
        onClose={() => setCityPickerOpen(false)}
        onConfirm={(next) => {
          patchRecruitWizard(previewMessageId, {
            wizardScope: {
              ...scope,
              city: buildRegionFromCityState(next.cityNational, next.selectedCities),
            },
          })
        }}
      />
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] text-slate-500">{label}</span>
      {children}
    </label>
  )
}

function ReqBlock({ title, text }: { title: string; text?: string }) {
  if (!text?.trim()) return null
  return (
    <div>
      <p className="text-[10px] font-medium text-slate-500">{title}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-slate-800">{text}</p>
    </div>
  )
}

function ReqList({ title, items }: { title: string; items?: string[] }) {
  const list = (items ?? []).filter(Boolean)
  if (!list.length) return null
  return (
    <div>
      <p className="text-[10px] font-medium text-slate-500">{title}</p>
      <ol className="mt-1 list-decimal space-y-1 pl-4 text-sm leading-relaxed text-slate-800">
        {list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  )
}

function ChoiceChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-medium text-white'
          : 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:border-violet-300'
      }
    >
      {children}
    </button>
  )
}
