import { useEffect, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  BadgeCheck,
  Bell,
  BookOpen,
  CircleHelp,
  CreditCard,
  FileText,
  Filter,
  Headphones,
  Heart,
  LayoutTemplate,
  LineChart,
  Share2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import { fetchTraining } from '../lib/mpApi'
import { getAccount } from '../lib/mpSession'
import { getWorkIdentity, WORK_EDITION_LABEL } from '../lib/mpWorkIdentity'
import { readMember, memberTypeLabel } from '../lib/mpSync/talentMember'
import { supplierSummaryLabel } from '../lib/mpSync/supplierTeamProfile'
import { prDisplayName, readPrProfile } from '../lib/mpSync/userProfile'
import { resolveShellDisplayName } from '../lib/shellDisplayName'
import TalentAccountBindPanel from '../components/TalentAccountBindPanel'
import { ProfileMineHeader } from '../components/ui/MockupLayouts'

type MenuGlyph = ComponentType<{ className?: string; strokeWidth?: number }>

type MenuEntry = {
  to: string
  label: string
  desc?: string
  group: 'quick' | 'deal' | 'money' | 'tools' | 'help'
}

const BIZ_SECTIONS = [
  { id: 'deal', title: '接单合作' },
  { id: 'money', title: '资金推广' },
  { id: 'tools', title: '内容与数据' },
  { id: 'help', title: '帮助服务' },
] as const

const TILE_TONES = [
  'bg-violet-50 text-violet-700',
  'bg-amber-50 text-amber-800',
  'bg-sky-50 text-sky-700',
  'bg-emerald-50 text-emerald-700',
  'bg-rose-50 text-rose-700',
  'bg-indigo-50 text-indigo-700',
]

function menuGlyph(to: string): MenuGlyph {
  if (to.startsWith('/profile/talent') || to.startsWith('/profile/pr') || to.startsWith('/profile/supplier')) {
    return UserRound
  }
  if (to.includes('local-life-eval')) return Sparkles
  if (to.includes('favorites')) return Heart
  if (to.includes('talent-credit')) return ShieldCheck
  if (to.includes('wallet')) return Wallet
  if (to.includes('subscriptions')) return Bell
  if (to.includes('pr-quotes')) return CreditCard
  if (to.includes('my-orders')) return FileText
  if (to.includes('affiliate')) return Share2
  if (to.includes('ai-review')) return BadgeCheck
  if (to.includes('training')) return BookOpen
  if (to.includes('analytics')) return LineChart
  if (to.includes('/help')) return CircleHelp
  if (to.includes('support')) return Headphones
  if (to.includes('cooperation')) return Users
  if (to.includes('brief-templates')) return LayoutTemplate
  if (to.includes('funnel')) return Filter
  if (to.includes('linke')) return Share2
  return Sparkles
}
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
  const [lecturerApproved, setLecturerApproved] = useState(false)

  useEffect(() => {
    void fetchPlatformDecorItem('dr.profile.banner', workId).then((item) => {
      setDecorBanner(item && item.imageUrl ? item : null)
    })
  }, [workId])
  useEffect(() => {
    if (!acc?.accountId) return
    void fetchTraining(acc.accountId)
      .then((data) => {
        const profile = data.profile as { lecturerStatus?: string; intro?: string; city?: string } | null
        const status = profile?.lecturerStatus
        setLecturerApproved(
          status === 'approved' || ((!status || status === '') && !!(profile?.intro && profile?.city)),
        )
      })
      .catch(() => setLecturerApproved(false))
  }, [acc?.accountId])
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
   * 顺序：资料和接单 → 钱和订单 → 讲师课程 → 数据 → 帮助。
   */
  const menuItems: MenuEntry[] = [
    {
      to: profileLink,
      label: profileMenuLabel,
      desc: profileDesc,
      group: 'quick',
    },
    ...(!isPr && workId !== 'shoot' && workId !== 'edit'
      ? [
          {
            to: '/profile/local-life-eval',
            label: '达人账号分析',
            desc: '抖音平台评分与整改，其他平台开放中',
            group: 'quick' as const,
          },
        ]
      : []),
    ...(isPr
      ? [
          {
            to: '/profile/cooperation',
            label: '合作达人池',
            desc: '已完成商单沉淀 · 优先复用',
            group: 'quick' as const,
          },
          {
            to: '/profile/brief-templates',
            label: 'Brief 模版',
            desc: '结构化发单模版 · 一键套用',
            group: 'quick' as const,
          },
          {
            to: '/profile/funnel',
            label: '招募漏斗',
            desc: '曝光→报名→入选→发布转化',
            group: 'quick' as const,
          },
          {
            to: '/profile/favorites',
            label: '我的收藏',
            desc: '收藏的达人 / 拍摄 / 剪辑团队',
            group: 'quick' as const,
          },
          {
            to: '/profile/linke',
            label: '抖音林客授权',
            desc: '非必填 · 发单可挂接林客商家',
            group: 'deal' as const,
          },
        ]
      : [
          {
            to: '/profile/subscriptions',
            label: '商单订阅',
            desc: '匹配城市/平台/品类的新招募提醒',
            group: 'quick' as const,
          },
          {
            to: '/profile/favorites',
            label: '我的收藏',
            desc: '收藏的招募商单',
            group: 'quick' as const,
          },
          {
            to: '/profile/talent-credit',
            label: '达人信用',
            desc: '履约评分与提升建议',
            group: 'quick' as const,
          },
          {
            to: '/profile/wallet',
            label: '我的钱包',
            desc: '积分、培训保证金与课时费应付款',
            group: 'quick' as const,
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
            group: 'deal' as const,
          },
        ]),
    ...(isPr
      ? [
          {
            to: '/profile/wallet',
            label: '我的钱包',
            desc: '积分、培训保证金与课时费应付款',
            group: 'money' as const,
          },
        ]
      : []),
    {
      to: '/profile/my-orders',
      label: '我的订单',
      desc: '会员开通与积分充值支付记录',
      group: 'money',
    },
    {
      to: '/affiliate/portal',
      label: '我的推广',
      desc: '推广码 · 太阳码 · 佣金与商户明细',
      group: 'money',
    },
    {
      to: '/profile/ai-review',
      label: 'AI审核',
      desc: '文稿与短视频合规检核',
      group: 'tools',
    },
    ...(lecturerApproved
      ? [
          {
            to: '/training?mine=1',
            label: '我的课程',
            desc: '发布、编辑和结算自己的培训',
            group: 'tools' as const,
          },
        ]
      : []),
    {
      to: '/profile/analytics',
      label: '数据分析',
      desc: isPr ? '发单与转化概况' : '报名与发单概况',
      group: 'tools',
    },
    { to: '/help', label: '使用说明', desc: '功能与操作方式', group: 'help' },
    { to: '/profile/support', label: '小灵同学', desc: '我的客服与常见问题', group: 'help' },
  ]
  const quickItems = menuItems.filter((item) => item.group === 'quick')
  const bizSections = BIZ_SECTIONS.map((section) => ({
    ...section,
    items: menuItems.filter((item) => item.group === section.id),
  })).filter((section) => section.items.length)

  return (
    <div className="page-content-shell page-content-shell--wide xx-profile-desk">
      <aside className="xx-profile-desk__side">
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

      <TalentAccountBindPanel />

      <dl className="surface-card rounded-xl border p-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--shell-muted)]">
            {isPr ? 'PR ID' : workId === 'shoot' ? '拍摄团队 ID' : workId === 'edit' ? '剪辑团队 ID' : '灵祺达人 ID'}
          </dt>
          <dd className="text-amber-600 font-mono text-xs">{systemId}</dd>
        </div>
      </dl>
      </aside>

      <div className="xx-profile-desk__main">
        <section>
          <h2 className="px-1 text-xs font-semibold tracking-[0.22em] text-[var(--shell-muted)]">常用功能</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {quickItems.map((item, index) => {
              const Icon = menuGlyph(item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="surface-card flex flex-col items-start gap-3 rounded-2xl border px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${TILE_TONES[index % TILE_TONES.length]}`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--shell-text)]">{item.label}</span>
                    {item.desc ? (
                      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-[var(--shell-muted)]">{item.desc}</span>
                    ) : null}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>

        {bizSections.map((section) => (
          <section key={section.id}>
            <h2 className="px-1 text-xs font-semibold tracking-[0.22em] text-[var(--shell-muted)]">{section.title}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {section.items.map((item, index) => {
                const Icon = menuGlyph(item.to)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="surface-card flex flex-col items-start gap-3 rounded-2xl border px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl ${TILE_TONES[index % TILE_TONES.length]}`}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--shell-text)]">{item.label}</span>
                      {item.desc ? (
                        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-[var(--shell-muted)]">{item.desc}</span>
                      ) : null}
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}

        <p className="text-xs text-[var(--shell-muted)]">完善资料后，推荐大厅将按标签与习惯智能匹配</p>
      </div>
    </div>
  )
}
