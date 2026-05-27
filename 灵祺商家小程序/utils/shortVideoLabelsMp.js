/** 与 web `shortVideoUiLabels.ts` 一致 */
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
  MAIN_TABS: [
    { id: 'optimize', label: '参考画面处理' },
    { id: 'generate', label: '短视频生成' },
    { id: 'cloud_batch', label: '灵祺AI云剪' },
  ],
}
