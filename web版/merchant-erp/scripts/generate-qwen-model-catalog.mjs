#!/usr/bin/env node
/**
 * 生成千问视觉 / 语音模型全量种子（供 qwenVisionCatalog / qwenSpeechCatalog 引用）。
 * 运行：node scripts/generate-qwen-model-catalog.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'src/lib/generated')

/** @param {string[]} ids @param {string} kind @param {number} startPriority */
function entries(ids, kind, startPriority = 1) {
  const uniq = [...new Set(ids.map((x) => x.trim()).filter(Boolean))]
  return uniq.map((modelId, i) => ({
    label: modelId,
    modelId,
    kind,
    priority: startPriority + i,
  }))
}

function wanSnapshots(prefix, suffixes) {
  const out = []
  for (const s of suffixes) out.push(`${prefix}${s}`)
  return out
}

function buildVisionCatalog() {
  const t2i = [
    'wan2.7-image-pro',
    'wan2.7-image',
    'wan2.6-t2i',
    'wan2.6-image',
    'wan2.5-t2i-preview',
    'wan2.2-t2i-plus',
    'wan2.2-t2i-flash',
    'wanx2.1-t2i-plus',
    'wanx2.0-t2i-turbo',
    'wanx-v1',
    ...wanSnapshots('qwen-image-max-', ['2025-12-30']),
    'qwen-image-max',
    ...wanSnapshots('qwen-image-2.0-pro-', ['2026-04-22', '2026-03-03']),
    'qwen-image-2.0-pro',
    'qwen-image-2.0',
    ...wanSnapshots('qwen-image-plus-', ['2026-01-09']),
    'qwen-image-plus',
    'qwen-image',
    'z-image-turbo',
    'wanx-sketch-to-image-lite',
    'wanx-poster-generation-v1',
    'wanx-x-painting',
    'wanx-virtualmodel',
    'wanx-background-generation-v2',
    'wordart-semantic',
    'wordart-texture',
    'aitryon',
    'aitryon-plus',
    'aitryon-refiner',
    'qwen-mt-image',
  ]

  const i2i = [
    ...wanSnapshots('qwen-image-edit-max-', ['2026-01-16']),
    'qwen-image-edit-max',
    ...wanSnapshots('qwen-image-edit-plus-', ['2025-12-15', '2025-10-30']),
    'qwen-image-edit-plus',
    'qwen-image-edit',
    'wanx2.1-imageedit',
    'wanx-style-repaint-v1',
    'wan2.5-i2i-preview',
    'image-out-painting',
  ]

  const t2v = [
    ...wanSnapshots('wan2.7-t2v-', ['2026-04-25']),
    'wan2.7-t2v',
    'wan2.6-t2v',
    'wanx2.2-t2v-plus',
    'wanx2.1-t2v-plus',
    'wanx2.1-t2v-turbo',
    'wan2.5-t2v-preview',
    'happyhorse-1.0-t2v',
  ]

  const i2v = [
    ...wanSnapshots('wan2.7-i2v-', ['2026-04-25']),
    'wan2.6-i2v-flash',
    'wan2.6-i2v',
    'wan2.5-i2v-preview',
    'wan2.2-i2v-plus',
    'wan2.2-i2v-flash',
    'wanx2.1-i2v-plus',
    'wanx2.1-i2v-turbo',
    'wan2.1-i2v',
    'happyhorse-1.0-i2v',
    'wanx2.1-kf2v-plus',
    'wan2.2-kf2v-flash',
  ]

  const r2v = [
    'wan2.7-r2v',
    'wan2.6-r2v',
    'wan2.6-r2v-flash',
    'happyhorse-1.0-r2v',
    'wanx2.1-vace-plus',
  ]

  const portrait = [
    'liveportrait',
    'animate-anyone-gen2',
    'animate-anyone-template-gen2',
    'videoretalk',
    'emo-v1',
    'wan2.2-animate-move',
    'wan2.2-animate-mix',
    'wan2.2-s2v',
  ]

  const videoEdit = [
    'wan2.1-videoedit',
    'happyhorse-1.0-video-edit',
    'video-style-transform',
  ]

  const vl = [
    'qwen-vl-max',
    'qwen-vl-max-latest',
    'qwen-vl-plus',
    'qwen-vl-plus-latest',
    ...wanSnapshots('qwen-vl-max-', ['2025-08-13', '2025-04-08', '2025-01-25', '2024-11-19', '2024-08-09']),
    ...wanSnapshots('qwen-vl-plus-', ['2025-08-15', '2025-05-07', '2025-01-25', '2024-08-09']),
    'qwen2-vl-72b-instruct',
    'qwen2-vl-7b-instruct',
    'qwen2-vl-2b-instruct',
    'qwen2.5-vl-72b-instruct',
    'qwen2.5-vl-32b-instruct',
    'qwen2.5-vl-7b-instruct',
    'qwen2.5-vl-3b-instruct',
    'qwen3-vl-plus',
    'qwen3-vl-flash',
    ...wanSnapshots('qwen3-vl-plus-', ['2025-09-23', '2025-08-15']),
    ...wanSnapshots('qwen3-vl-flash-', ['2025-09-23', '2025-08-15']),
    'qwen-vl-ocr',
    'qwen-vl-ocr-latest',
    ...wanSnapshots('qwen-vl-ocr-', ['2024-10-28']),
  ]

  const ocrDoc = [
    'doc-ocr',
    'doc-ocr-latest',
    'qwen-doc-turbo',
    'qwen-doc-plus',
    'qwen-doc-turbo-latest',
    'qwen-doc-plus-latest',
  ]

  const video3d = ['wanx-3d-asset', 'wanx-3d-human', 'wanx-3d-avatar']

  const miscVision = [
    'image-instance-segmentation',
    'image-erase-completion',
    'image-segmentation',
    'facechain-facedetect',
    'facechain-finetune',
    'facechain-generation',
    'stable-diffusion-xl',
    'stable-diffusion-3.5-large',
    'flux-schnell',
    'flux-dev',
    'cogview-3-plus',
    'cogview-4',
    'wan2.2-s2v-detect',
    'video-depth-anything',
    'video-super-resolution',
    'video-interpolation',
    'video-enhance',
    'video-object-tracking',
    'video-captioning',
    'video-summary',
    'video-question-answer',
    'image-captioning',
    'image-question-answer',
    'image-segmentation-anything',
    'image-matting',
    'image-colorization',
    'image-deblurring',
    'image-denoising',
    'image-super-resolution',
    'image-restoration',
  ]

  const all = [
    ...entries(t2i, 'image_t2i'),
    ...entries(i2i, 'image_i2i', 100),
    ...entries(t2v, 'video_t2v', 200),
    ...entries(i2v, 'video_i2v', 300),
    ...entries(r2v, 'video_r2v', 400),
    ...entries(portrait, 'video_portrait', 500),
    ...entries(videoEdit, 'video_edit', 600),
    ...entries(vl, 'vision_vl', 700),
    ...entries(ocrDoc, 'vision_ocr', 800),
    ...entries(video3d, 'video_3d', 900),
    ...entries(miscVision, 'vision_misc', 1000),
  ]

  return all
}

function buildSpeechCatalog() {
  const cosyvoice = [
    'cosyvoice-v3.5-plus',
    'cosyvoice-v3.5-flash',
    'cosyvoice-v3-plus',
    'cosyvoice-v3-flash',
    'cosyvoice-v2',
    'cosyvoice-v1',
  ]

  const qwenTts = [
    'qwen3-tts-instruct-flash-realtime',
    'qwen3-tts-instruct-flash-realtime-2026-01-22',
    'qwen3-tts-vd-realtime-2026-01-15',
    'qwen3-tts-vd-realtime-2025-12-16',
    'qwen3-tts-vc-realtime-2026-01-15',
    'qwen3-tts-vc-realtime-2025-11-27',
    'qwen3-tts-flash-realtime',
    'qwen3-tts-flash-realtime-2025-11-27',
    'qwen3-tts-flash-realtime-2025-09-18',
    'qwen3-tts-vd-2026-01-26',
    'qwen3-tts-vc-2026-01-22',
    'qwen-tts-realtime',
    'qwen-tts-realtime-latest',
    'qwen-tts-realtime-2025-07-15',
  ]

  const sambert = [
    'sambert-zhinan-v1',
    'sambert-zhiqi-v1',
    'sambert-zhichu-v1',
    'sambert-zhide-v1',
    'sambert-zhijia-v1',
    'sambert-zhiru-v1',
    'sambert-zhiqian-v1',
    'sambert-zhixiang-v1',
    'sambert-zhiwei-v1',
    'sambert-zhihao-v1',
    'sambert-zhijing-v1',
    'sambert-zhiming-v1',
    'sambert-zhimo-v1',
    'sambert-zhina-v1',
    'sambert-zhishu-v1',
    'sambert-zhistella-v1',
    'sambert-zhiting-v1',
    'sambert-zhixiao-v1',
    'sambert-zhiya-v1',
    'sambert-zhiye-v1',
    'sambert-zhiying-v1',
    'sambert-zhiyuan-v1',
    'sambert-zhiyue-v1',
    'sambert-zhigui-v1',
    'sambert-zhishuo-v1',
    'sambert-zhimiao-emo-v1',
    'sambert-zhimao-v1',
    'sambert-zhilun-v1',
    'sambert-zhifei-v1',
    'sambert-zhida-v1',
    'sambert-camila-v1',
    'sambert-perla-v1',
    'sambert-indah-v1',
    'sambert-clara-v1',
    'sambert-hanna-v1',
    'sambert-beth-v1',
    'sambert-betty-v1',
    'sambert-cally-v1',
    'sambert-cindy-v1',
    'sambert-eva-v1',
    'sambert-donna-v1',
    'sambert-brian-v1',
    'sambert-waan-v1',
  ]

  const asr = [
    'paraformer-realtime-v2',
    'paraformer-v2',
    'paraformer-v1',
    'paraformer-8k-v1',
    'paraformer-mtl-v1',
    'paraformer-long-v1',
    'paraformer-short-v1',
    'fun-asr',
    'fun-asr-realtime',
    'fun-asr-mtl',
    'fun-asr-v2',
    'sensevoice-v1',
    'sensevoice-small',
    'qwen-audio-turbo',
    'qwen-audio-turbo-latest',
    'qwen2-audio-instruct',
    'qwen-audio-asr',
    'qwen-audio-asr-latest',
  ]

  const voiceDesign = [
    'voice-enrollment',
    'voice-design',
    'voice-clone',
  ]

  const cosyVoices = [
    'longanyang',
    'longxiaochun_v2',
    'longwan_v2',
    'longfei_v2',
    'longjiao_v2',
    'longhua_v2',
    'longcheng_v2',
    'longshu_v2',
    'longshuo_v2',
    'longjing_v2',
    'longmiao_v2',
    'longyue_v2',
    'longxiaocheng_v2',
    'longxiaoxia_v2',
    'longanhuan_v3',
    'longanyang_v3',
    'longfei_v3',
    'longjiao_v3',
    'longlaotie_v3',
    'longling_v3',
    'longmiao_v3',
    'longnan_v3',
    'longshu_v3',
    'longshuo_v3',
    'longtian_v3',
    'longwan_v3',
    'longxiaocheng_v3',
    'longxiaochun_v3',
    'longxiaoxia_v3',
    'longyue_v3',
    'longyuan_v3',
    'longze_v3',
    'loongstella_v3',
    'loongbella_v3',
  ]

  const all = [
    ...entries(cosyvoice, 'tts_cosyvoice'),
    ...entries(qwenTts, 'tts_qwen', 100),
    ...entries(sambert, 'tts_sambert', 200),
    ...entries(cosyVoices, 'tts_voice', 300),
    ...entries(voiceDesign, 'tts_meta', 350),
    ...entries(asr, 'asr', 400),
  ]

  return all
}

function writeTsSeed(name, payload) {
  const models = payload.models
  const body = `/** AUTO-GENERATED by scripts/generate-qwen-model-catalog.mjs — do not edit */\nexport const ${name} = ${JSON.stringify({ generatedAt: payload.generatedAt, count: payload.count, models }, null, 2)} as const\n`
  fs.writeFileSync(path.join(OUT, `${name}.ts`), body)
}

function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const vision = buildVisionCatalog()
  const speech = buildSpeechCatalog()
  writeTsSeed('qwenVisionModelSeed', {
    generatedAt: new Date().toISOString(),
    count: vision.length,
    models: vision,
  })
  writeTsSeed('qwenSpeechModelSeed', {
    generatedAt: new Date().toISOString(),
    count: speech.length,
    models: speech,
  })
  console.log(`vision models: ${vision.length}`)
  console.log(`speech models: ${speech.length}`)
  console.log(`written to ${OUT}`)
}

main()
