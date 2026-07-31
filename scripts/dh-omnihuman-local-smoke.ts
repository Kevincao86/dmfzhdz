/**
 * 本机校验：OmniHuman 任务 ID 前缀与签名构造。
 * 用法：./web版/merchant-erp/node_modules/.bin/tsx scripts/dh-omnihuman-local-smoke.ts
 */
import {
  isOmniHumanTaskId,
  OMNIHUMAN_TASK_PREFIX,
  stripOmniHumanTaskPrefix,
} from '../web版/merchant-erp/vite-plugins/volcOmniHumanClient.ts'
import { signVolcVisualJsonPost } from '../web版/merchant-erp/vite-plugins/volcVisualSign.ts'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

async function main(): Promise<void> {
  const tid = `${OMNIHUMAN_TASK_PREFIX}plain-task`
  assert(isOmniHumanTaskId(tid), '应识别 omnihuman: 前缀')
  assert(stripOmniHumanTaskPrefix(tid) === 'plain-task', '应剥离前缀')
  assert(!isOmniHumanTaskId('ark-task-1'), '普通 taskId 不应误判')

  const signed = signVolcVisualJsonPost({
    accessKeyId: 'AKTEST',
    secretAccessKey: 'SKTEST',
    action: 'JimengRealmanAvatarPictureOmniV15SubmitTask',
    version: '2024-06-06',
    body: {
      req_key: 'jimeng_realman_avatar_picture_omni_v15',
      image_url: 'https://example.com/a.jpg',
      audio_url: 'https://example.com/a.mp3',
    },
  })
  assert(signed.url.includes('JimengRealmanAvatarPictureOmniV15SubmitTask'), 'URL 须含专用 Action')
  assert(signed.url.includes('2024-06-06'), 'URL 须含 2024-06-06')
  assert(signed.headers.Authorization?.includes('HMAC-SHA256'), '须 V4 签名')
  assert(signed.body.includes('jimeng_realman_avatar_picture_omni_v15'), 'body 含 req_key')

  console.log('OK: OmniHuman local unit — V15 Action + volc visual sign')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
