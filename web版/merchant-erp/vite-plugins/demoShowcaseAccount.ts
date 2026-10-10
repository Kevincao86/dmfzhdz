/** 商家演示号：登录名 lingqi-demo。生视频 / 生图只回预设成片，不调用上游。 */

export const DEMO_SHOWCASE_LOGIN = 'lingqi-demo'

export const DEMO_SHOWCASE_VIDEO_URL =
  'https://mofangdianai.com/erp-mp-static/short-video-cases/case-hotpot.mp4?v=cdn14'

export const DEMO_SHOWCASE_IMAGE_URL =
  'https://mofangdianai.com/erp-mp-static/short-video-cases/case-hotpot.png?v=cdn14'

export function isDemoShowcaseEmail(email: string | undefined | null): boolean {
  const local = String(email || '')
    .trim()
    .toLowerCase()
    .split('@')[0]
  return local === DEMO_SHOWCASE_LOGIN
}

const VIDEO_TASK = 'demo-showcase-video'
const ICE_JOB = 'demo-showcase-ice'

/** 命中则返回预设结果；未命中返回 null，走真实生成。 */
export function demoShowcaseVideoPayload(
  method: string,
  pathname: string,
): Record<string, unknown> | null {
  const m = method.toUpperCase()
  const path = pathname
  if (m === 'POST' && /\/(seedance|kling|dh-s2v)\/start$/.test(path)) {
    return {
      ok: true,
      taskId: VIDEO_TASK,
      provider: 'demo',
      modelUsed: 'showcase',
      pipeline: 'showcase',
      pollKind: 'text2video',
      demoShowcase: true,
    }
  }
  if (m === 'GET' && /\/(seedance|kling|dh-s2v)\/status$/.test(path)) {
    return {
      ok: true,
      phase: 'succeeded',
      statusLabel: '演示成片',
      videoUrl: DEMO_SHOWCASE_VIDEO_URL,
      provider: 'demo',
      demoShowcase: true,
    }
  }
  if (m === 'POST' && path.endsWith('/ice/pipeline')) {
    return { ok: true, jobId: ICE_JOB, exportId: ICE_JOB, demoShowcase: true }
  }
  if (m === 'POST' && path.endsWith('/ice/smart-batch')) {
    return {
      ok: true,
      batchJobId: ICE_JOB,
      jobId: ICE_JOB,
      exportId: ICE_JOB,
      demoShowcase: true,
    }
  }
  if (
    m === 'GET' &&
    (path.endsWith('/ice/job') ||
      path.endsWith('/ice/smart-batch/job') ||
      path.endsWith('/ice/smart-batch-job'))
  ) {
    return {
      ok: true,
      status: 'Success',
      done: true,
      failed: false,
      outputPending: false,
      downloadUrl: DEMO_SHOWCASE_VIDEO_URL,
      previewUrl: DEMO_SHOWCASE_VIDEO_URL,
      videoUrl: DEMO_SHOWCASE_VIDEO_URL,
      demoShowcase: true,
    }
  }
  return null
}
