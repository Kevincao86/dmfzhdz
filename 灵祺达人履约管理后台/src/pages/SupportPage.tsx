import { useState } from 'react'
import FloatingOnlineSupport from '@merchant/components/FloatingOnlineSupport'
import { getAccount } from '../lib/mpSession'

const FAQS = [
  // 通用
  { q: '如何登录星选平台？', a: '使用小程序「我的信息」中设置的手机号与密码登录；开发预览可使用登录页「开发预览」入口。' },
  { q: '如何切换达人/拍摄/剪辑/PR 身份？', a: '左侧栏底部「身份切换」，或在小程序「我的」页顶部点击身份标签切换；菜单随当前身份变化。' },
  { q: 'Web 与小程序数据不同步？', a: '确认两端登录同一微信账号；API 走 ECS 数据面。退出登录会清本机缓存，切换账号后请重新登录。' },
  // 达人
  { q: '【达人】如何完善资料提升推荐匹配？', a: '进入「我的 → 达人资料」，填写抖音/小红书粉丝、城市与品类标签；修改后刷新推荐 Tab。' },
  { q: '【达人】如何报名商单？', a: '在招募大厅或推荐大厅打开商单详情，点击「立即报名」并提交表单；转单显示「前往原表报名」。' },
  { q: '【达人】报名后无反馈？', a: '报名≠立即探店，PR 需在报名列表审核。保持消息开启，或在「小灵同学」输入订单编号转人工。' },
  { q: '【达人】云剪直发如何接单？', a: '在云剪任务详情报名 → 确认接收 → 下载唯一成片 → 按时发布并回传链接。' },
  // 拍摄
  { q: '【拍摄】接不到拍摄类订单？', a: '确认已切换拍摄团队身份；完善团队信息（设备、风格、作品集）；筛选拍摄类招募目标。' },
  { q: '【拍摄】档期冲突或交片延迟？', a: '报名前核对 Brief 日期；冲突时通过消息联系 PR 协商，勿静默爽约。驳回按备注修改重传。' },
  // 剪辑
  { q: '【剪辑】云剪任务如何接单？', a: '在云剪任务详情报名后，于「我的报名」确认接收，下载成片并回传发布链接。' },
  { q: '【剪辑】任务包条数不足无法提交？', a: '认领 N 条须上传 N 个文件；仅剪辑身份可认领。不足时补全文件后重试。' },
  { q: '【剪辑】审片驳回如何重传？', a: '查看被驳回条及 PR 备注，仅修改对应条重新上传；全部通过后等待 PR 结案或转达人直发。' },
  // PR
  { q: '【PR】如何发布招募？', a: '「发布招募」选目标（达人/拍摄/剪辑），填平台/预算/封面，关联报名表模版后发布。' },
  { q: '【PR】转单招募怎么发？', a: '「转发工具」粘贴原表 HTTPS 链接，预览编辑后发布；达人侧显示「前往原表报名」。' },
  { q: '【PR】如何审核报名与视频？', a: '「我的发单」→ 报名列表通过/拒绝；启用回传时在「视频审核」审片，剪辑包可转达人直发。' },
  // 客服
  { q: '如何联系人工客服？', a: '在本页「小灵同学」对话框输入「人工服务」可转接运营人工处理。' },
]

export default function SupportPage() {
  const acc = getAccount()
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4 support-page">
      <header>
        <h1 className="text-xl font-bold">小灵同学</h1>
        <p className="text-sm text-[var(--shell-muted)] mt-1">我的客服与常见问题 · 与小程序客服能力一致</p>
      </header>

      <div className="surface-card rounded-xl border divide-y">
        {FAQS.map((item, i) => (
          <div key={item.q}>
            <button
              type="button"
              className="w-full text-left px-4 py-3 flex items-center justify-between gap-2 hover:bg-[var(--shell-hover)]"
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
            >
              <span className="font-medium text-sm">{item.q}</span>
              <span className="text-[var(--shell-muted)]" aria-hidden>
                {openIndex === i ? '▴' : '▾'}
              </span>
            </button>
            {openIndex === i ? (
              <p className="px-4 pb-3 text-sm text-[var(--shell-muted)] leading-relaxed">{item.a}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="support-page__chat-hint surface-card rounded-xl border p-4 text-sm text-[var(--shell-muted)]">
        点击下方右下角「在线客服」图标，与小灵同学对话；输入「人工服务」可接入运营。
      </div>

      <FloatingOnlineSupport
        relayChannel="mp"
        customerId={acc?.lingqiTalentId || acc?.lingqiPrId || acc?.loginName || ''}
        enterpriseName={acc?.wxNickName || acc?.loginName || '灵祺星选·Web'}
      />
    </div>
  )
}
