/**
 * 运营台 videoAi 切片合入 MerchantAiEnv（商品图 / 云剪 / 智能体豆包共用，避免 merchantVideoAiGateway 与 registryVendorEnv 循环依赖）。
 */
import { normalizeVendorKeysFromDisk } from '../src/lib/aiVendorCatalogShared.js'
import { pickMergedArkChatEndpointsField, pickMergedArkEndpointsField } from '../src/lib/arkVideoEndpointsConfig.js'
import type { RegistryFile } from '../src/lib/opsRegistryTypes.js'
import { normalizeRegistryVideoAi } from '../src/lib/registryVideoAiNormalize.js'
import type { MerchantAiEnv } from './merchantAiUpstream.js'

/** 将注册表中的 videoAi / vendorKeys 合入 env。ICE/OSS 以运营台为准；其余项 env 非空时保留。 */
export function applyRegistryVideoAiToMerchantEnv(
  out: MerchantAiEnv,
  reg: Partial<Pick<RegistryFile, 'videoAi' | 'vendorKeys'>>,
): void {
  const vx = normalizeRegistryVideoAi(reg.videoAi)
  const vk = normalizeVendorKeysFromDisk(reg.vendorKeys)

  const fill = (key: string, val: string | undefined) => {
    const v = val?.trim()
    if (!v) return
    const cur = String((out as Record<string, string | undefined>)[key] ?? '').trim()
    if (cur) return
    ;(out as Record<string, string>)[key] = v
  }

  const setFromRegistry = (key: string, val: string | undefined) => {
    const v = val?.trim()
    if (!v) return
    ;(out as Record<string, string>)[key] = v
  }

  fill('KLING_ACCESS_KEY', vx.klingAccessKey)
  fill('KLING_SECRET_KEY', vx.klingSecretKey)
  fill('KLING_API_BASE', vx.klingApiBase)
  setFromRegistry('ALIYUN_ICE_APP_ID', vx.iceAppId)
  setFromRegistry('ALIYUN_ICE_ACCESS_KEY_ID', vx.iceAccessKeyId)
  setFromRegistry('ALIYUN_ICE_ACCESS_KEY_SECRET', vx.iceAccessKeySecret)
  setFromRegistry('ALIYUN_ICE_REGION', vx.iceRegion)
  setFromRegistry('ALIYUN_ICE_VOD_STORAGE_LOCATION', vx.iceVodStorageLocation)
  setFromRegistry('ALIYUN_ICE_OUTPUT_OSS_URL_PREFIX', vx.iceOutputOssUrlPrefix)

  const envEp = String(
    out.MERCHANT_AI_ARK_VIDEO_ENDPOINTS ?? out.MERCHANT_AI_SEEDANCE_VIDEO_MODELS ?? '',
  ).trim()
  const regEp = vx.arkVideoEndpoints?.trim() ?? ''
  const mergedEp = pickMergedArkEndpointsField(envEp, regEp)
  if (mergedEp) {
    out.MERCHANT_AI_ARK_VIDEO_ENDPOINTS = mergedEp
  } else {
    const preserve = envEp || regEp
    if (preserve) out.MERCHANT_AI_ARK_VIDEO_ENDPOINTS = preserve
  }

  const envChatEp = String(out.MERCHANT_AI_DOUBAO_CHAT_ENDPOINTS ?? '').trim()
  const regChatEp = vx.arkChatEndpoints?.trim() ?? ''
  const mergedChatEp = pickMergedArkChatEndpointsField(envChatEp, regChatEp)
  if (mergedChatEp) {
    out.MERCHANT_AI_DOUBAO_CHAT_ENDPOINTS = mergedChatEp
  } else {
    const preserveChat = envChatEp || regChatEp
    if (preserveChat) out.MERCHANT_AI_DOUBAO_CHAT_ENDPOINTS = preserveChat
  }

  const arkFromEnv = String(out.MERCHANT_AI_DOUBAO_KEY ?? out.ARK_API_KEY ?? '').trim()
  if (!arkFromEnv) {
    const fromVideo = vx.arkVideoApiKey?.trim()
    const fromVendor = typeof vk.doubao === 'string' ? vk.doubao.trim() : ''
    if (fromVideo) out.MERCHANT_AI_DOUBAO_KEY = fromVideo
    else if (fromVendor) out.MERCHANT_AI_DOUBAO_KEY = fromVendor
  }

  const qwenFromEnv = String(out.MERCHANT_AI_QWEN_KEY ?? out.DASHSCOPE_API_KEY ?? '').trim()
  if (!qwenFromEnv) {
    const fromVendor = typeof vk.qwen === 'string' ? vk.qwen.trim() : ''
    if (fromVendor) {
      out.MERCHANT_AI_QWEN_KEY = fromVendor
    }
  }
}
