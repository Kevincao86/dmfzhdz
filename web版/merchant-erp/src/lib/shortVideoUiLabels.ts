/** 商户短视频页 · 对外展示名（与运营后台厂商配置解耦） */
/** 火山方舟 Seedance 1.5 Pro */

export const VIDEO_ENGINE_LABEL_KLING = '灵祺视频模型1'
export const VIDEO_ENGINE_LABEL_SEEDANCE = '灵祺视频'
export const VIDEO_ENGINE_HINT_SEEDANCE = '文案口播 · 音画一体'
export const VIDEO_ENGINE_HINT_SEEDANCE_FRAMES = '分镜参考图成片'
export const VIDEO_ENGINE_HINT_MOTION_IMITATE = '动作模仿 · 点名换人'
export const VIDEO_ENGINE_HINT_QWEN = '通义万相视频'
export const SEEDANCE_QUALITY_OPTIONS = [
  { id: '720p', label: '标准 720p' },
  { id: '1080p', label: '高清 1080p' },
] as const
export type SeedanceQualityId = (typeof SEEDANCE_QUALITY_OPTIONS)[number]['id']
export const VIDEO_MODEL_DEFAULT_LABEL = '默认'

export const KLING_DEFAULT_MODEL_ID = 'kling-v1-6'
export const SEEDANCE_SERVER_AUTO = '__server_auto__'
export const SEEDANCE_AUTO_LABEL = '自动（额度不足时切换）'
/** 纯文案短片：Seedance 1.5 Pro（原生音画一体） */
export const SEEDANCE_1_5_PRO_MODEL_ID = 'doubao-seedance-1-5-pro-251215'
/** 分镜参考图：Seedance 2.0（多图 r2v，官方暂无 2.5 方舟 ID） */
export const SEEDANCE_2_0_MODEL_ID = 'doubao-seedance-2-0-260128'
