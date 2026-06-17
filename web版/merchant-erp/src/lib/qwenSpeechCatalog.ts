/**
 * 百炼 / 通义千问语音模型全量目录（TTS / ASR / 音色）。
 * 种子由 scripts/generate-qwen-model-catalog.mjs 生成；额度不足时同型自动切换。
 */
import type { ArkCatalogEntry } from './arkModelCatalog.js'
import { mergeCatalogModelIds } from './arkModelCatalog.js'
import { randomRotateModelIds } from './vendorModelPool.js'
import { qwenSpeechModelSeed as speechSeed } from './generated/qwenSpeechModelSeed.js'

export type QwenSpeechKind = 'tts_cosyvoice' | 'tts_qwen' | 'tts_sambert' | 'tts_voice' | 'tts_meta' | 'asr'

export type QwenSpeechEntry = ArkCatalogEntry & { kind: QwenSpeechKind | string }

function loadSpeechFromSeed(): QwenSpeechEntry[] {
  const rows = speechSeed.models ?? []
  return rows.map((r) => ({
    label: r.label,
    modelId: r.modelId,
    kind: r.kind as QwenSpeechKind,
    priority: r.priority,
  }))
}

export const QWEN_SPEECH_CATALOG: QwenSpeechEntry[] = loadSpeechFromSeed()

/** 数字人口播 TTS：CosyVoice → Sambert（HTTP 非实时） */
export const QWEN_DH_TTS_CATALOG: QwenSpeechEntry[] = QWEN_SPEECH_CATALOG.filter((e) =>
  ['tts_cosyvoice', 'tts_sambert'].includes(String(e.kind)),
)

/** 口型驱动候选见 qwenVisionCatalog.qwenPortraitModelCandidates */

export function qwenSpeechModelCandidates(
  envRaw: string | undefined,
  preferredId: string | undefined,
  kinds: readonly QwenSpeechKind[],
): string[] {
  const filtered = QWEN_SPEECH_CATALOG.filter((e) => kinds.includes(e.kind as QwenSpeechKind))
  const merged = mergeCatalogModelIds(filtered, envRaw, preferredId, 'speech')
  if (merged.length <= 1) return merged
  const pref = preferredId?.trim()
  if (pref && merged[0] === pref) {
    const rest = merged.slice(1)
    return rest.length ? [pref, ...randomRotateModelIds(rest)] : [pref]
  }
  return randomRotateModelIds(merged)
}

export function qwenDhTtsModelCandidates(envRaw?: string, preferredId?: string): string[] {
  const env = envRaw ?? ''
  const filtered = QWEN_DH_TTS_CATALOG
  const merged = mergeCatalogModelIds(filtered, env, preferredId, 'speech')
  if (merged.length <= 1) return merged
  return randomRotateModelIds(merged)
}

/** CosyVoice 系统音色（按性别优选） */
export function cosyVoiceForGender(gender: '男' | '女'): string {
  return gender === '女' ? 'longxiaochun_v2' : 'longanyang'
}

/** Sambert：model 即 voice */
export function sambertVoiceForGender(gender: '男' | '女'): string {
  return gender === '女' ? 'sambert-zhichu-v1' : 'sambert-zhinan-v1'
}

export function isCosyVoiceModel(modelId: string): boolean {
  return /^cosyvoice-/i.test(modelId.trim())
}

export function isSambertModel(modelId: string): boolean {
  return /^sambert-/i.test(modelId.trim())
}
