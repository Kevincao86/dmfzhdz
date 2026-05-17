import AiModelAutoPicker from '../AiModelAutoPicker'
import { listWizardImageModelOptions, listWizardTextModelOptions } from '../../lib/douyinWizardAiModels'

export default function DouyinProductAiModelSection() {
  const textOptions = listWizardTextModelOptions()
  const imageOptions = listWizardImageModelOptions()

  return (
    <section className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-violet-50/50 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">AI 模型</h3>
      <p className="mt-1 text-xs text-gray-600">
        默认开启「自动」：按已配置 API Key 与运营目录智能选择。关闭后可手选；手选时仅展示厂商 logo + 名称。
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-indigo-900">文案大模型</p>
          <AiModelAutoPicker kind="text" options={textOptions} compactManualTrigger />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-violet-900">图片大模型（与 AI 智能体生图一致）</p>
          <AiModelAutoPicker kind="image" options={imageOptions} compactManualTrigger />
        </div>
      </div>
    </section>
  )
}
