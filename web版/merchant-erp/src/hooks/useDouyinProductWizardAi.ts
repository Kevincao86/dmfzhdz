import { useCallback, useState } from 'react'
import {
  postDouyinGoodsAiAssist,
  type AiAssistRequest,
  type AiModelId,
} from '../services/douyinAiAssistApi'
import { buildImageAssistTextFields } from '../lib/douyinProductImageAnchor'
import { resolveModelForAssistAction } from '../services/merchantAiModelStorage'

export type AiGoodsContext = {
  goods_category_id?: string
  goods_product_type?: number
  goods_category_path_zh?: string
  goods_product_type_label?: string
}

type AiBusySlot = 'title' | 'desc' | 'img-head' | 'img-aux' | 'img-env'

const MAX_AUX = 4
const MAX_ENV = 10

export function useDouyinProductWizardAi(params: {
  productName: string
  productDesc: string
  priceYuan?: string
  originYuan?: string
  setProductName: (v: string) => void
  setProductDesc: (v: string) => void
  setHeadUrl: (v: string) => void
  headUrl: string
  auxUrls: string[]
  setAuxUrls: (v: string[]) => void
  envUrls: string[]
  setEnvUrls: (v: string[]) => void
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

  const imageAssistFields = useCallback(() => {
    const ctx = params.goodsContext
    const base = buildImageAssistTextFields(params.productName, params.productDesc, {
      productType: ctx?.goods_product_type,
      productTypeLabel: ctx?.goods_product_type_label,
    })
    return {
      ...base,
      price_yuan: params.priceYuan?.trim() || undefined,
      origin_yuan: params.originYuan?.trim() || undefined,
    }
  }, [params.productName, params.productDesc, params.priceYuan, params.originYuan, params.goodsContext])

  const postAssist = useCallback(
    async (body: Omit<AiAssistRequest, 'model'>) => {
      const model = resolveModelForAssistAction(body.action) as AiModelId
      const r = await postDouyinGoodsAiAssist({
        ...body,
        model,
        ...(params.goodsContext ?? {}),
      })
      if (r.ok) {
        const meta = 'image_meta' in r ? r.image_meta : undefined
        if (
          meta &&
          meta.requested_model !== meta.resolved_model &&
          (body.action === 'image_generate' || body.action === 'image_enhance')
        ) {
          console.info(
            `[商品生图] 手选「${meta.requested_model}」未接像素引擎，已使用 ${meta.resolved_model}；代金券模式=${meta.voucher_mode}，锚点=${meta.main_product_anchor}`,
          )
        }
        return r
      }
      if (!r.needVendorKey) return r
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
      const img = imageAssistFields()
      const r = await postAssist({
        action: 'image_generate',
        ...img,
        image_role: 'head',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.[0]) params.setHeadUrl(r.image_urls[0])
    } finally {
      endAi('img-head')
    }
  }, [postAssist, params, imageAssistFields, beginAi, endAi])

  const enhanceHeadImage = useCallback(async () => {
    const h = params.headUrl.trim()
    if (!h) {
      window.alert('请先上传头图后再优化')
      return
    }
    if (!params.productName.trim()) {
      window.alert('请先填写商品名称，以便 AI 根据标题解析主推产品后再优化头图')
      return
    }
    beginAi('img-head')
    try {
      const img = imageAssistFields()
      const r = await postAssist({
        action: 'image_enhance',
        ...img,
        image_urls: [h],
        image_role: 'head',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.[0]) params.setHeadUrl(r.image_urls[0])
    } finally {
      endAi('img-head')
    }
  }, [postAssist, params, imageAssistFields, beginAi, endAi])

  const filledAux = useCallback(
    () => params.auxUrls.map((u) => u.trim()).filter(Boolean),
    [params.auxUrls],
  )

  const filledEnv = useCallback(
    () => params.envUrls.map((u) => u.trim()).filter(Boolean),
    [params.envUrls],
  )

  const generateAuxImage = useCallback(async () => {
    if (filledAux().length >= MAX_AUX) return
    const n = params.productName.trim()
    if (!n) {
      window.alert('请先填写商品名称')
      return
    }
    beginAi('img-aux')
    try {
      const img = imageAssistFields()
      const r = await postAssist({
        action: 'image_generate',
        ...img,
        image_role: 'aux',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.[0]) {
        const next = [...filledAux(), r.image_urls[0]!].slice(0, MAX_AUX)
        params.setAuxUrls(next.length > 0 ? next : [''])
      }
    } finally {
      endAi('img-aux')
    }
  }, [postAssist, params, imageAssistFields, beginAi, endAi, filledAux])

  const enhanceAuxImages = useCallback(async () => {
    const urls = filledAux()
    if (urls.length === 0) {
      window.alert('请先上传辅助图后再优化')
      return
    }
    if (!params.productName.trim()) {
      window.alert('请先填写商品名称，以便 AI 根据标题解析主推产品')
      return
    }
    beginAi('img-aux')
    try {
      const img = imageAssistFields()
      const r = await postAssist({
        action: 'image_enhance',
        ...img,
        image_urls: urls,
        image_role: 'aux',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.length) {
        params.setAuxUrls(r.image_urls.slice(0, MAX_AUX))
      }
    } finally {
      endAi('img-aux')
    }
  }, [postAssist, params, imageAssistFields, beginAi, endAi, filledAux])

  const generateEnvImage = useCallback(async () => {
    if (filledEnv().length >= MAX_ENV) return
    const n = params.productName.trim()
    if (!n) {
      window.alert('请先填写商品名称')
      return
    }
    beginAi('img-env')
    try {
      const img = imageAssistFields()
      const r = await postAssist({
        action: 'image_generate',
        ...img,
        image_role: 'env',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.[0]) {
        const next = [...filledEnv(), r.image_urls[0]!].slice(0, MAX_ENV)
        params.setEnvUrls(next.length > 0 ? next : [''])
      }
    } finally {
      endAi('img-env')
    }
  }, [postAssist, params, imageAssistFields, beginAi, endAi, filledEnv])

  const enhanceEnvImages = useCallback(async () => {
    const urls = filledEnv()
    if (urls.length === 0) {
      window.alert('请先上传环境图后再优化')
      return
    }
    if (!params.productName.trim()) {
      window.alert('请先填写商品名称，以便 AI 根据标题解析主推产品')
      return
    }
    beginAi('img-env')
    try {
      const img = imageAssistFields()
      const r = await postAssist({
        action: 'image_enhance',
        ...img,
        image_urls: urls,
        image_role: 'env',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.length) {
        params.setEnvUrls(r.image_urls.slice(0, MAX_ENV))
      }
    } finally {
      endAi('img-env')
    }
  }, [postAssist, params, imageAssistFields, beginAi, endAi, filledEnv])

  return {
    aiOn,
    optimizeTitleAndDesc,
    generateHeadImage,
    enhanceHeadImage,
    generateAuxImage,
    enhanceAuxImages,
    generateEnvImage,
    enhanceEnvImages,
  }
}
