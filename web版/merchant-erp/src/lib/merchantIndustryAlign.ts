/**
 * 智能体「组品/套餐」经营方案的类目参考（非硬拦截）。
 * 用户明确要求改图、改字、生成任意主题图文时，必须按用户指令执行，不得以品类不符拒绝。
 */

const NO_CATEGORY_BLOCK =
  '【勿品类拦截】用户上传图片要求改图/改字/P图/换文案，或明确要求生成/修改任意主题内容时：' +
  '必须按用户指令直接执行，禁止以「与门店经营品类不符」「本店不做餐饮/数码」等理由拒绝或改题。' +
  '下列类目说明仅在用户主动做「组品/创建商品/套餐方案」时作为参考，不得用于拦截其它请求。'

export function formatIndustryAlignmentConstraint(
  industryPath?: string,
  storeName?: string,
): string {
  const text = [industryPath, storeName].filter(Boolean).join(' ').trim()
  let industryHint: string
  if (!text) {
    industryHint =
      '【类目参考·仅组品时】回复经营组品时可参考绑定平台类目、菜单价目或商品列表；类目未知时给通用建议即可。'
  } else if (/餐饮|美食|火锅|烧烤|茶饮|咖啡|西餐|中餐|小吃|烘焙|酒吧|酒馆/.test(text)) {
    industryHint = '【类目参考·仅组品时】本商户偏餐饮：用户若要做套餐/组品，可围绕菜品、饮品、代金券建议。'
  } else if (/3[Cc]|数码|电子|家电|科技|手机|电脑|智能设备|通讯|光学|摄影/.test(text)) {
    industryHint =
      '【类目参考·仅组品时】本商户偏数码/3C：用户若要做套餐/组品，可围绕数码团购、配件、到店体验、代金券建议。'
  } else if (/美[容妆发]|美甲|护肤|美发|SPA|养生|足浴|足疗/.test(text)) {
    industryHint =
      '【类目参考·仅组品时】本商户偏美业/养生：用户若要做套餐/组品，可围绕服务项目、体验券、套餐卡建议。'
  } else if (/汽车|车饰|4[Ss]|汽修|洗车/.test(text)) {
    industryHint =
      '【类目参考·仅组品时】本商户偏汽车：用户若要做套餐/组品，可围绕洗车、保养、车饰、体验券建议。'
  } else {
    industryHint =
      `【类目参考·仅组品时】本商户经营类目为「${industryPath || storeName}」：` +
      '用户若主动做组品/套餐/推广方案，可优先贴合该类目；不得据此拒绝用户其它明确指令。'
  }
  return `${NO_CATEGORY_BLOCK}\n${industryHint}`
}

export function summarizeDraftProductPicks(
  picks: { name: string; priceYuan: number }[],
  max = 20,
): string | undefined {
  if (!picks.length) return undefined
  const lines = picks.slice(0, max).map((p) => {
    const price = p.priceYuan > 0 ? ` ¥${p.priceYuan}` : ''
    return `- ${p.name}${price}`
  })
  if (picks.length > max) lines.push(`…共 ${picks.length} 项`)
  return lines.join('\n')
}
