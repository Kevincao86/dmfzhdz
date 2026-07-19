import { useEffect, useState } from 'react'
import { getAccount } from '../lib/mpSession'
import { getWorkIdentity, WORK_EDITION_LABEL } from '../lib/mpWorkIdentity'
import { readMember, memberTypeLabel } from '../lib/mpSync/talentMember'
import { supplierSummaryLabel } from '../lib/mpSync/supplierTeamProfile'
import { prDisplayName, readPrProfile } from '../lib/mpSync/userProfile'
import { resolveShellDisplayName } from '../lib/shellDisplayName'
import { ProfileMenuList, ProfileMineHeader } from '../components/ui/MockupLayouts'
import { readApplications, readPublishedOrders } from '../lib/mpSync/applicationsStore'
import {
  fetchPlatformDecorItem,
  openDecorLink,
} from '@merchant/lib/platformDecorClient'
import { isDecorVideoMedia, type RegistryPlatformDecorItem } from '@merchant/lib/platformDecorTypes'

export default function ProfilePage() {
  const acc = getAccount()
  const workId = getWorkIdentity()
  const isPr = workId === 'pr'
  const [decorBanner, setDecorBanner] = useState<RegistryPlatformDecorItem | null>(null)

  useEffect(() => {
    void fetchPlatformDecorItem('dr.profile.banner', workId).then((item) => {
      setDecorBanner(item && item.imageUrl ? item : null)
    })
  }, [workId])
  const member = readMember()
  const pr = readPrProfile()
  const edition = WORK_EDITION_LABEL[workId]

  const displayName = resolveShellDisplayName()
  const avatar = isPr ? pr?.wxAvatarUrl || acc?.wxAvatarUrl || '' : acc?.wxAvatarUrl || ''

  const systemId = isPr
    ? acc?.lingqiPrId || pr?.lingqiPrId || '—'
    : workId === 'shoot'
      ? member?.lingqiShootTeamId || acc?.lingqiShootTeamId || '—'
      : workId === 'edit'
        ? member?.lingqiEditTeamId || acc?.lingqiEditTeamId || '—'
        : acc?.lingqiTalentId || member?.lingqiTalentId || '—'

  const apps = readApplications()
  const published = isPr ? readPublishedOrders().filter((o) => !o.deletedAt) : []

  const stats = isPr
    ? [
        { label: '发单数', value: published.length },
        { label: '草稿', value: 0 },
        { label: '完成数', value: published.filter((o) => o.lastStatus === 'done').length },
      ]
    : [
        { label: '报名数', value: apps.length },
        { label: '待处理', value: apps.length },
        { label: '已完成', value: 0 },
      ]

  const profileLink = isPr
    ? '/profile/pr'
    : workId === 'shoot' || workId === 'edit'
      ? '/profile/supplier'
      : '/profile/talent'

  const profileDesc = isPr
    ? pr ? prDisplayName(pr) || '已保存 PR 资料' : '填写机构/个人信息'
    : workId === 'shoot' || workId === 'edit'
      ? member?.supplierProfile
        ? supplierSummaryLabel(workId, member.supplierProfile as never)
        : '尚未填写团队资料'
      : member
        ? `已填写平台：${memberTypeLabel(member)}`
        : '尚未填写多平台资料'

  const profileMenuLabel = isPr
    ? '我的 PR 信息'
    : workId === 'shoot'
      ? '拍摄团队信息'
      : workId === 'edit'
        ? '剪辑团队信息'
        : '我的信息'

  /**
   * 个人推广入口：必须以内联字面量写进 menuItems（勿抽成变量后再展开，
   * 避免错误构建/旧 dist 漏打包导致线上「我的推广」消失）。
   */
  const menuItems = [
    {
      to: '/profile/points-recharge',
      label: '积分充值',
      desc: 'AI 视频/文稿检核与 Brief 消耗',
    },
    {
      to: '/profile/my-orders',
      label: '我的订单',
      desc: '会员开通与积分充值支付记录',
    },
    {
      to: '/affiliate/portal',
      label: '我的推广',
      desc: '推广码 · 太阳码 · 佣金与商户明细',
    },
    {
      to: profileLink,
      label: profileMenuLabel,
      desc: profileDesc,
    },
    ...(isPr
      ? [
          {
            to: '/profile/cooperation',
            label: '合作达人池',
            desc: '已完成商单沉淀 · 优先复用',
          },
          {
            to: '/profile/brief-templates',
            label: 'Brief 模版',
            desc: '结构化发单模版 · 一键套用',
          },
          {
            to: '/profile/funnel',
            label: '招募漏斗',
            desc: '曝光→报名→入选→发布转化',
          },
          {
            to: '/profile/linke',
            label: '抖音林客授权',
            desc: '非必填 · 发单可挂接林客商家',
          },
          {
            to: '/profile/favorites',
            label: '我的收藏',
            desc: '收藏的达人 / 拍摄 / 剪辑团队',
          },
        ]
      : [
          {
            to: '/profile/subscriptions',
            label: '商单订阅',
            desc: '匹配城市/平台/品类的新招募提醒',
          },
          {
            to: '/profile/talent-credit',
            label: '达人信用',
            desc: '履约评分与提升建议',
          },
          {
            to: '/profile/favorites',
            label: '我的收藏',
            desc: '收藏的招募商单',
          },
          {
            to: '/profile/pr-quotes',
            label: '我的报价',
            desc:
              workId === 'shoot'
                ? '为合作 PR 设置拍摄专属报价（半天/全天）'
                : workId === 'edit'
                  ? '为合作 PR 设置剪辑专属报价（单条/半天/全天）'
                  : '为合作 PR 设置专属报价',
          },
        ]),
    {
      to: '/profile/analytics',
      label: '数据分析',
      desc: isPr ? '发单与转化概况' : '报名与发单概况',
    },
    { to: '/help', label: '帮助中心', desc: '使用说明与常见问题' },
    { to: '/profile/support', label: '小灵同学', desc: '我的客服与常见问题' },
  ]

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <ProfileMineHeader
        avatar={avatar}
        name={displayName}
        roleBadge={edition}
        stats={stats}
      />

      {decorBanner?.imageUrl ? (
        <button
          type="button"
          className="block w-full overflow-hidden rounded-xl border border-[var(--shell-border)] bg-[var(--panel-card)] text-left"
          onClick={() => openDecorLink(decorBanner)}
        >
          {isDecorVideoMedia(decorBanner) ? (
            <video
              src={decorBanner.imageUrl}
              className="max-h-40 w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <img
              src={decorBanner.imageUrl}
              alt={decorBanner.title || '活动'}
              className="max-h-40 w-full object-cover"
            />
          )}
          {decorBanner.title ? (
            <p className="border-t border-[var(--shell-border)] px-3 py-2 text-sm font-medium text-[var(--shell-text)]">
              {decorBanner.title}
            </p>
          ) : null}
        </button>
      ) : null}

      <dl className="surface-card rounded-xl border p-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--shell-muted)]">手机号</dt>
          <dd className="text-[var(--shell-text)]">{acc?.loginName || acc?.wxNickName || '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--shell-muted)]">
            {isPr ? 'PR ID' : workId === 'shoot' ? '拍摄团队 ID' : workId === 'edit' ? '剪辑团队 ID' : '灵祺达人 ID'}
          </dt>
          <dd className="text-amber-600 font-mono text-xs">{systemId}</dd>
        </div>
      </dl>

      <ProfileMenuList items={menuItems} />

      <p className="text-center text-xs text-[var(--shell-muted)]">
        完善资料后，推荐大厅将按标签与习惯智能匹配
      </p>
    </div>
  )
}
