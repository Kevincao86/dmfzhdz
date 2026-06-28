/**
 * 探店成片 AI 违规检核冒烟：本地词扫描 + 字段映射（不依赖线上 Key）
 */
import { runRecruitmentVideoComplianceCheck } from '../src/lib/recruitmentVideoComplianceCore.js'

const fakeEnv = { MERCHANT_AI_DOUBAO_KEY: 'sk-smoke-invalid' }

async function main() {
  const suspect = await runRecruitmentVideoComplianceCheck(
    {
      orderTitle: '测试商单',
      recruitmentInfo: '本店全网最低价，限时秒杀保证效果',
      merchantRequirements: '口播需提及店铺',
    },
    fakeEnv,
  )
  if (!suspect.ok) throw new Error(`suspect case failed: ${suspect.message}`)
  if (suspect.verdict !== 'suspect') {
    throw new Error(`expected suspect, got ${suspect.verdict}`)
  }
  if (!suspect.message.includes('可能违规')) {
    throw new Error(`unexpected message: ${suspect.message}`)
  }
  if (!suspect.hits.some((h) => h.includes('全网最低'))) {
    throw new Error(`expected 全网最低 in hits: ${suspect.hits.join(',')}`)
  }

  const cheapest = await runRecruitmentVideoComplianceCheck(
    {
      orderTitle: '汉堡探店',
      extraText: '【口播 ASR】\n周边最便宜的汉堡就在这家店',
    },
    fakeEnv,
  )
  if (!cheapest.ok) throw new Error(`cheapest case failed: ${cheapest.message}`)
  if (cheapest.verdict !== 'suspect') {
    throw new Error(`expected suspect for 最便宜, got ${cheapest.verdict}`)
  }
  if (!cheapest.hits.some((h) => h.includes('最便宜'))) {
    throw new Error(`expected 最便宜 in hits: ${cheapest.hits.join(',')}`)
  }

  const noKey = await runRecruitmentVideoComplianceCheck(
    { recruitmentInfo: '普通探店文案' },
    {},
  )
  if (noKey.ok || !noKey.message.includes('未配置 AI 模型 Key')) {
    throw new Error('expected no-key error')
  }

  const empty = await runRecruitmentVideoComplianceCheck({}, fakeEnv)
  if (empty.ok || !empty.message.includes('缺少可检核')) {
    throw new Error(`expected empty-content error, got: ${empty.ok ? 'ok' : empty.message}`)
  }

  console.log('OK: recruitment video compliance smoke passed')
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e))
  process.exit(1)
})
