import { useCallback, useMemo, useState } from 'react'
import {
  postDouyinGoodsAiAssist,
  type AiAssistRequest,
  type AiModelId,
} from '../services/douyinAiAssistApi'
import { resolveModelForAssistAction } from '../services/merchantAiModelStorage'

export type AiGoodsContext = {
  goods_category_id?: string
  goods_product_type?: number
  goods_category_path_zh?: string
  goods_product_type_label?: string
}

type AiBusySlot = 'title' | 'desc' | 'img-head' | 'img-aux' | 'img-env'

export function useDouyinProductWizardAi(params: {
  productName: string
  productDesc: string
  setProductName: (v: string) => void
  setProductDesc: (v: string) => void
  setHeadUrl: (v: string) => void
  headUrl: string
  goodsContext?: AiGoodsContext
}) {
  const [aiBusySlots, setAiBusySlots] = useState<Partial<Record<AiBusySlot, boolean>>>({})

  const beginAi = useCallback((k: AiBusySlot) => {
    setAiBusySlots((s) => ({ ...s, [k]: true }))
  }, [])

  const endAi = useCallback((k: AiBusySlot) => {
    setAiBusySlots((s) => {
      const n = { ...s }
      delete n[k]
      return n
    })
  }, [])

  const aiOn = useCallback((k: AiBusySlot) => !!aiBusySlots[k], [aiBusySlots])

  const imageAssistTitleDraft = useMemo(() => {
    const name = params.productName.trim()
    if (!name) return ''
    const desc = params.productDesc.trim().slice(0, 400)
    return desc ? `${name}。${desc}` : name
  }, [params.productName, params.productDesc])

  const postAssist = useCallback(
    async (body: Omit<AiAssistRequest, 'model'>) => {
      const model = resolveModelForAssistAction(body.action) as AiModelId
      const r = await postDouyinGoodsAiAssist({
        ...body,
        model,
        ...(params.goodsContext ?? {}),
      })
      if (r.ok || !r.needVendorKey) return r
      return {
        ok: false as const,
        message: `${r.message} 请在部署环境配置 MERCHANT_AI_QWEN_KEY、MERCHANT_AI_DOUBAO_KEY、MERCHANT_AI_MINIMAX_KEY 等密钥。`,
      }
    },
    [params.goodsContext],
  )

  const optimizeTitleAndDesc = useCallback(async () => {
    const draft = params.productName.trim()
    if (!draft) {
      window.alert('请先在商品名称框内输入标题，再点击「AI 优化标题与说明」')
      return
    }
    beginAi('title')
    beginAi('desc')
    try {
      const base = {
        product_name: draft,
        title_draft: draft,
      }
      const [r, d] = await Promise.all([
        postAssist({ action: 'optimize_title', ...base }),
        postAssist({ action: 'generate_desc', ...base }),
      ])
      if (!r.ok) window.alert(r.message)
      else if (r.title) params.setProductName(r.title.slice(0, 40))
      if (!d.ok) {
        if (r.ok) window.alert(d.message)
      } else if (d.description) params.setProductDesc(d.description)
    } finally {
      endAi('title')
      endAi('desc')
    }
  }, [postAssist, params, beginAi, endAi])

  const generateHeadImage = useCallback(async () => {
    const n = params.productName.trim()
    if (!n) {
      window.alert('请先填写商品名称，以便 AI 生成头图')
      return
    }
    beginAi('img-head')
    try {
      const r = await postAssist({
        action: 'image_generate',
        product_name: n,
        title_draft: imageAssistTitleDraft || n,
        image_role: 'head',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.[0]) params.setHeadUrl(r.image_urls[0])
    } finally {
      endAi('img-head')
    }
  }, [postAssist, params, imageAssistTitleDraft, beginAi, endAi])

  const enhanceHeadImage = useCallback(async () => {
    const h = params.headUrl.trim()
    if (!h) {
      window.alert('请先上传头图后再优化')
      return
    }
    const n = params.productName.trim() || '商品'
    beginAi('img-head')
    try {
      const r = await postAssist({
        action: 'image_enhance',
        product_name: n,
        title_draft: imageAssistTitleDraft || n,
        image_urls: [h],
        image_role: 'head',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.[0]) params.setHeadUrl(r.image_urls[0])
    } finally {
      endAi('img-head')
    }
  }, [postAssist, params, imageAssistTitleDraft, beginAi, endAi])

  return {
    aiOn,
    optimizeTitleAndDesc,
    generateHeadImage,
    enhanceHeadImage,
  }
}
