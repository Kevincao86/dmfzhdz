/** 套餐到期预警：按总权益剩余天数分桶 + 公告文案智能起草 */

export type ExpiringBucket = 5 | 3 | 1

export type AnnouncementTenantRow = {
  id: string
  name: string
  loginName: string
  plan: string
  serviceExpireAt: string | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** 总权益剩余天数（向上取整；无到期日返回 null） */
export function entitlementRemainDays(serviceExpireAt: string | null | undefined): number | null {
  if (!serviceExpireAt?.trim()) return null
  const ms = new Date(serviceExpireAt).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  return Math.ceil(ms / MS_PER_DAY)
}

/**
 * 分桶（互不重叠）：
 * - 5 天：剩余 (3, 5] 天
 * - 3 天：剩余 (1, 3] 天
 * - 1 天：剩余 (0, 1] 天（含今日内到期）
 */
export function filterTenantsByExpiringBucket(
  tenants: AnnouncementTenantRow[],
  bucket: ExpiringBucket,
): AnnouncementTenantRow[] {
  return tenants.filter((t) => {
    if (!t.serviceExpireAt?.trim()) return false
    const ms = new Date(t.serviceExpireAt).getTime() - Date.now()
    if (ms <= 0) return false
    if (bucket === 5) return ms > 3 * MS_PER_DAY && ms <= 5 * MS_PER_DAY
    if (bucket === 3) return ms > 1 * MS_PER_DAY && ms <= 3 * MS_PER_DAY
    return ms <= 1 * MS_PER_DAY
  })
}

export function countByExpiringBucket(
  tenants: AnnouncementTenantRow[],
): Record<ExpiringBucket, number> {
  return {
    5: filterTenantsByExpiringBucket(tenants, 5).length,
    3: filterTenantsByExpiringBucket(tenants, 3).length,
    1: filterTenantsByExpiringBucket(tenants, 1).length,
  }
}

function fmtExpire(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return iso
  }
}

/** 根据所选到期分桶与客户列表生成标题与正文（运营可再编辑） */
export function draftExpiringAnnouncementCopy(
  bucket: ExpiringBucket,
  recipients: AnnouncementTenantRow[],
): { title: string; body: string } {
  const n = recipients.length
  const dayPhrase =
    bucket === 5 ? '5 日内' : bucket === 3 ? '约 3 天内' : '1 日内（含今日）'

  const title =
    bucket === 5
      ? '【灵祺 ERP】会员总权益将在 5 日内到期，请及时续费'
      : bucket === 3
        ? '【灵祺 ERP】会员总权益仅剩约 3 天，请尽快续费'
        : '【灵祺 ERP】会员总权益即将到期，请立即续费'

  const samples = recipients
    .slice(0, 5)
    .map((t) => {
      const exp = t.serviceExpireAt ? fmtExpire(t.serviceExpireAt) : '—'
      const remain = entitlementRemainDays(t.serviceExpireAt)
      const remainText = remain != null ? `剩余约 ${remain} 天` : ''
      return `· ${t.name}（${t.plan}，服务至 ${exp}${remainText ? `，${remainText}` : ''}）`
    })
    .join('\n')

  const body = `尊敬的灵祺商户，您好：

系统检测到您的账户「会员总权益」将在 ${dayPhrase} 到期。到期后，GEO 分析、竞对分析、报税管理及高级 AI 能力可能受限或暂停，为避免影响日常经营，请尽快登录灵祺 ERP：

1. 打开「系统设置」→「订阅」
2. 选择适合的会员方案并完成续费

${n > 0 ? `本次提醒面向 ${n} 个账户，权益截止概况如下：\n${samples}${n > 5 ? '\n· … 等更多账户' : ''}` : '请在订阅页查看当前权益与到期时间。'}

续费成功后，总权益时长将自动顺延。如需协助，请通过 ERP 右下角「在线客服」联系我们。

感谢您的支持！
—— 灵祺运营团队`

  return { title, body }
}
