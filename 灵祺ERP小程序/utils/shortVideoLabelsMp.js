/** 与 web `shortVideoUiLabels.ts` / `shortVideoStudioModes.ts` 对齐的标签与入口 */
module.exports = {
  VIDEO_ENGINE_LABEL_KLING: '灵祺视频模型1',
  VIDEO_ENGINE_LABEL_SEEDANCE: '灵祺视频模型2',
  VIDEO_MODEL_DEFAULT_LABEL: '默认',
  KLING_DEFAULT_MODEL_ID: 'kling-v1-6',
  KLING_MODEL_OPTIONS: [
    { id: 'kling-v1', label: 'Kling V1' },
    { id: 'kling-v1-6', label: 'Kling V1.6（默认）' },
    { id: 'kling-v2-master', label: 'Kling V2 Master' },
  ],
  ICE_ASPECT_PRESETS: [
    { id: '9:16', label: '竖屏 9:16', width: 1080, height: 1920 },
    { id: '16:9', label: '横屏 16:9', width: 1920, height: 1080 },
    { id: '1:1', label: '方屏 1:1', width: 1080, height: 1080 },
  ],
  ICE_BATCH_GENERATE_COUNTS: [10, 20, 50, 100],
  /** 与 CS ShortVideoOptimizationPage 顶栏一致；小程序可原生执行 generate / cloud_batch */
  MAIN_TABS: [
    { id: 'generate', label: '短视频生成', native: true },
    { id: 'cloud_batch', label: 'AI混剪', native: true },
    { id: 'canvas', label: '无限画布', native: false },
    { id: 'cases', label: '案例', native: false },
    { id: 'music', label: '配乐', native: false },
  ],
  /** 与 CS SHORT_VIDEO_STUDIO_MODES 对齐的创作模式入口 */
  STUDIO_MODES: [
    {
      id: 'agent',
      label: 'Agent 模式',
      description: '自然语言规划分镜出片',
      pane: 'generate',
    },
    {
      id: 'video',
      label: '视频生成',
      description: '文生/图生短片',
      pane: 'generate',
    },
    {
      id: 'music',
      label: '音乐 / 配乐',
      description: '曲库试听（完整版在电脑端）',
      pane: 'music',
    },
    {
      id: 'digital_human',
      label: '数字人口播',
      description: '跳转数字人试听/电脑端成片',
      href: '/pages/digital-human/digital-human',
    },
    {
      id: 'canvas',
      label: '无限画布',
      description: '分镜编排（完整版在电脑端）',
      pane: 'canvas',
    },
    {
      id: 'copywriting',
      label: '推广文案',
      description: '跳转文案工作台',
      href: '/pages/ai-content/ai-content',
    },
  ],
}
