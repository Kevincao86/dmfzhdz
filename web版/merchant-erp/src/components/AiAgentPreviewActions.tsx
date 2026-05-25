import { cn } from '../cn'
import { useAiAgent } from '../context/AiAgentContext'
import { aiTaskConfirmLabel } from '../lib/aiAgentPlan'
import { GROUPBUY_PLATFORMS } from '../constants/productCreatePlatforms'
import type { CreatePlatformId } from '../constants/productCreatePlatforms'

type Props = {
  confirmDisabled: boolean
  confirmLabel?: string
  showProductPlatforms?: boolean
}

export function AiAgentPreviewActions({
  confirmDisabled,
  confirmLabel: confirmLabelOverride,
  showProductPlatforms = false,
}: Props) {
  const {
    pendingPreviewTaskType,
    pendingPreviewLoading,
    taskConfirming,
    previewSubmitPlatforms,
    togglePreviewSubmitPlatform,
    confirmPendingTask,
    savePendingTaskToDrafts,
    modifyPendingTask,
    cancelPendingTask,
  } = useAiAgent()

  const confirmLabel =
    confirmLabelOverride ??
    (pendingPreviewLoading
      ? '正在生成预览…'
      : taskConfirming
        ? pendingPreviewTaskType === 'create_product'
          ? '正在提交审核…'
          : '正在生成订单…'
        : aiTaskConfirmLabel(pendingPreviewTaskType))

  const selectablePlatforms = GROUPBUY_PLATFORMS.filter((p) => !p.comingSoon)

  return (
    <div className="mt-3 space-y-3 border-t border-violet-100 pt-3">
      {showProductPlatforms ? (
        <div>
          <p className="mb-2 text-[11px] font-medium text-slate-600">提交至平台（可多选）</p>
          <div className="flex flex-wrap gap-2">
            {selectablePlatforms.map((p) => {
              const checked = previewSubmitPlatforms.includes(p.id as CreatePlatformId)
              return (
                <label
                  key={p.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition',
                    checked
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                    confirmDisabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={checked}
                    disabled={confirmDisabled}
                    onChange={() => togglePreviewSubmitPlatform(p.id as CreatePlatformId)}
                  />
                  {p.name}
                </label>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {showProductPlatforms ? (
          <button
            type="button"
            onClick={() => savePendingTaskToDrafts()}
            disabled={confirmDisabled}
            className={cn(
              'rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-medium text-indigo-900 hover:bg-indigo-100',
              confirmDisabled && 'cursor-not-allowed opacity-50',
            )}
          >
            批量保存至草稿箱
          </button>
        ) : null}
        <button
          type="button"
          onClick={confirmPendingTask}
          disabled={confirmDisabled}
          className={cn(
            'rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:brightness-110',
            confirmDisabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={modifyPendingTask}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          修改方案
        </button>
        <button
          type="button"
          onClick={cancelPendingTask}
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-800 hover:bg-red-100"
        >
          取消
        </button>
      </div>
    </div>
  )
}
