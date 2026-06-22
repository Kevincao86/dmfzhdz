#!/usr/bin/env npx tsx
/**
 * 数字人口播自定义媒体链路 smoke（Node 可跑部分）
 */
import {
  CUSTOM_UPLOAD_VOICE_PRESETS,
  resolveVoiceForDraft,
  voiceOptionsForCustomAvatar,
  type DigitalHumanDraft,
} from '../src/lib/digitalHumanBroadcast.ts'
import { estimateS2vSegmentCountFromDuration } from '../src/lib/digitalHumanAudioChunks.ts'

const customDraft: DigitalHumanDraft = {
  avatarId: null,
  customAvatarDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
  avatarKind: 'photo',
  outfit: '默认',
  hairstyle: '默认',
  background: 'studio',
  frameMode: 'half',
  resolution: '720P',
  driveMode: 'text',
  script: '这是一段测试口播文案，用于验证自定义形象音色解析是否正常。',
  douyinLinkUrl: '',
  motionInstructions: '',
  audioFileName: null,
  voiceId: 'v-clone',
  speechRate: 1,
  speechPitch: 1,
  subtitleEnabled: true,
  subtitleStyle: 'bottom-white',
  greenScreen: false,
  gesturePreset: 'none',
  multiScene: false,
}

const cloneVoice = resolveVoiceForDraft(customDraft, null)
if (!cloneVoice?.cloudVoiceId) {
  console.error('FAIL: v-clone should fallback to cloud TTS voice')
  process.exit(1)
}

const customOptions = voiceOptionsForCustomAvatar()
if (customOptions.length < 3) {
  console.error('FAIL: custom avatar voice options too few')
  process.exit(1)
}

const female = resolveVoiceForDraft(
  { ...customDraft, voiceId: 'v-custom-female' },
  null,
)
if (female?.cloudVoiceId !== CUSTOM_UPLOAD_VOICE_PRESETS[0]?.cloudVoiceId) {
  console.error('FAIL: custom female voice mismatch')
  process.exit(1)
}

if (estimateS2vSegmentCountFromDuration(37) !== 3) {
  console.error('FAIL: audio segment estimate')
  process.exit(1)
}

console.log('OK: digital human custom media voice + audio segment smoke')
