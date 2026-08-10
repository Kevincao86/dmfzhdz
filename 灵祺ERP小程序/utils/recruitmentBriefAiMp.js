const merchantApi = require('./merchantApi.js')
const { readPlatformToken } = require('./platformTokensMp.js')

const PATHS = ['/api/meoo-douyin-goods-ai-assist', '/api/merchant/douyin/goods/ai/assist']

function splitThreeBriefs(description) {
  const text = String(description || '').trim()
  const parts = text.split(/\|\|\|BREAK\|\|\|/g).map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 3) return [parts[0], parts[1], parts[2]]
  const paras = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
  if (paras.length >= 3) return [paras[0], paras[1], paras[2]]
  const one = text || '（模型未返回有效 Brief，请重试或检查商家后台服务配置）'
  const short = one.slice(0, Math.min(one.length, 420))
  return [
    `${short}\n\n【版本 A】侧重卖点与到店理由`,
    `${short}\n\n【版本 B】侧重场景体验与情绪共鸣`,
    `${short}\n\n【版本 C】侧重平台话题与传播钩子`,
  ]
}

async function postGoodsAiAssist(payload) {
  const token = readPlatformToken('douyin')
  if (!token) throw new Error('请先绑定抖音来客（生成 Brief 与 Web 同源接口需抖音 Bearer）')
  let lastErr = ''
  for (const p of PATHS) {
    try {
      const data = await merchantApi.merchantRequestAuth('POST', p, {
        bearerToken: token,
        data: payload,
      })
      const desc =
        data && (data.description || (data.data && data.data.description) || data.result || data.text || '')
      return { ok: true, raw: data, description: typeof desc === 'string' ? desc : '' }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: false, message: lastErr || '请求失败', description: '' }
}

/** 对齐 Web generateThreeKolBriefs：单轮 operation_article */
async function generateThreeKolBriefsMp(args) {
  const tags = Array.isArray(args.tags) ? args.tags.filter(Boolean).slice(0, 12) : []
  const main = args.main || { name: '', priceYuan: 0 }
  const sec = args.secondary
  const titleDraft = `你是本地生活达人合作 Brief 策划。请严格基于下列真实商品信息输出 3 套不同的「达人合作 Brief」正文（中文），每套 350～650 字，避免互相重复。
投放平台：${args.platformLabel || '抖音来客'}
经营行业：${args.industry || '本地生活'}
主推商品：${main.name}（约 ¥${main.priceYuan || 0}）
次推商品：${sec && sec.name ? `${sec.name}（约 ¥${sec.priceYuan || 0}）` : '无'}
标签：${tags.length ? tags.join('、') : '（无）'}
门店：${args.storeName || '—'}

输出格式：三套正文之间只用分隔符 |||BREAK||| 连接，不要添加其它说明文字。`

  const r = await postGoodsAiAssist({
    model: 'qwen',
    action: 'operation_article',
    product_name: `达人合作Brief｜${main.name || '主推品'}`,
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description) {
    throw new Error(r.message || '服务调用失败')
  }
  const [b1, b2, b3] = splitThreeBriefs(r.description)
  return [b1, b2, b3]
}

module.exports = { generateThreeKolBriefsMp, splitThreeBriefs }
