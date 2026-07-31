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
  const tid = `${OMNIHUMAN_TASK_PREFIX}abc123`
  assert(isOmniHumanTaskId(tid), '应识别 omnihuman: 前缀')
  assert(stripOmniHumanTaskPrefix(tid) === 'abc123', '应剥离前缀')
  assert(!isOmniHumanTaskId('ark-task-1'), '普通 taskId 不应误判')

  const signed = signVolcVisualJsonPost({
    accessKeyId: 'AKTEST',
    secretAccessKey: 'SKTEST',
    action: 'CVSync2AsyncSubmitTask',
    body: {
      req_key: 'jimeng_realman_avatar_picture_omni_v15',
      image_url: 'https://example.com/a.jpg',
      audio_url: 'https://example.com/a.mp3',
    },
  })
  assert(signed.url.includes('Action=CVSync2AsyncSubmitTask'), 'URL 须含 Action')
  assert(signed.headers.Authorization?.includes('HMAC-SHA256'), '须 V4 签名')
  assert(signed.headers['X-Content-Sha256'], '须 body sha')
  assert(signed.body.includes('audio_url'), 'body 含音频')

  console.log('OK: OmniHuman local unit — taskId prefix + volc visual sign')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
