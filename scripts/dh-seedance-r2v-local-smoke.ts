/**
 * 本机校验：Seedance 1.x 默认压成 first_frame；数字人即梦首尾帧用 first_last（非 r2v）。
 * 用法：./web版/merchant-erp/node_modules/.bin/tsx scripts/dh-seedance-r2v-local-smoke.ts
 */
import {
  buildSeedanceImageContentItems,
  clampSeedanceImagesForModel,
  seedanceModelSupportsReferenceR2v,
} from '../web版/merchant-erp/src/lib/arkVideoContentPayload.ts'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

async function main(): Promise<void> {
  const tiny =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  const model1x = 'doubao-seedance-1-0-pro-fast-251015'
  const model15 = 'doubao-seedance-1-5-pro-251215'
  const model20 = 'doubao-seedance-2-0-260128'

  assert(!seedanceModelSupportsReferenceR2v(model1x), '1.0 不应支持 r2v')
  assert(!seedanceModelSupportsReferenceR2v(model15), '1.5 不应支持 r2v')
  assert(seedanceModelSupportsReferenceR2v(model20), '2.0 应支持 r2v')

  assert(clampSeedanceImagesForModel(model1x, [tiny, tiny]).length === 1, '1.x 默认多图应压成 1')
  assert(clampSeedanceImagesForModel(model20, [tiny, tiny]).length === 2, '2.0 默认可保留多图')
  assert(
    clampSeedanceImagesForModel(model1x, [tiny, tiny], 'first_last').length === 2,
    '1.x first_last 应保留 2 张',
  )

  const items1x = buildSeedanceImageContentItems([tiny, tiny], model1x)
  assert(items1x.length === 1, '1.x content 单图')
  assert(items1x[0]?.role === 'first_frame', '1.x 须 first_frame')

  const itemsFl = buildSeedanceImageContentItems([tiny, tiny], model1x, 'first_last')
  assert(itemsFl.length === 2, 'first_last 双图')
  assert(itemsFl[0]?.role === 'first_frame', '首帧 role')
  assert(itemsFl[1]?.role === 'last_frame', '尾帧 role')
  assert(
    itemsFl.every((x) => x.role !== 'reference_image'),
    '首尾帧不得标 reference_image（避免 r2v）',
  )

  const items20 = buildSeedanceImageContentItems([tiny, tiny], model20)
  assert(items20.length === 2, '2.0 content 双图')
  assert(
    items20.every((x) => x.role === 'reference_image'),
    '2.0 默认须 reference_image',
  )

  console.log('OK: local unit — 1.x→first_frame, first_last→首尾帧, 2.0→reference_image')

  if (process.env.DH_R2V_LIVE_TEST !== '1') {
    console.log('SKIP live API（设 DH_R2V_LIVE_TEST=1 可打 cs seedance-start）')
    return
  }

  const body = {
    prompt:
      '竖屏口播测试，即梦首尾帧：将首帧人物深度融入尾帧场景，保持五官清晰，禁止灰底贴片。',
    flags: '--dur 5 --rt 9:16',
    images_base64: [
      tiny.replace(/^data:image\/\w+;base64,/, ''),
      tiny.replace(/^data:image\/\w+;base64,/, ''),
    ],
    i2v_max_images: 2,
    seedance_image_mode: 'first_last',
    prefer_quota_stable: true,
    skip_qwen: true,
    model: model1x,
  }

  const url = 'https://cs.mofangdianai.com/erp-api/meoo-merchant-ai-video-seedance-start'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log('live status', res.status, text.slice(0, 500))
  if (/task_type.*r2v|r2v does not support/i.test(text)) {
    throw new Error('LIVE FAIL: 仍出现 r2v 不支持错误（需先部署轻量）')
  }
  if (
    !res.ok &&
    /invalid image|image_url|不是有效|请填写|width to be at least|at least 300px|1x1px/i.test(text)
  ) {
    console.log('OK: live 已越过 r2v（当前失败为图片尺寸/业务校验，属预期）')
    return
  }
  if (res.ok || /taskId|"ok"\s*:\s*true/i.test(text)) {
    console.log('OK: live 发起成功')
    return
  }
  console.log('WARN: live 返回非预期，但 unit 已通过；若尚未部署轻量可忽略')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
