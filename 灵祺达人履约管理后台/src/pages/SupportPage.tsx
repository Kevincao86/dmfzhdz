import { useState } from 'react'
import FloatingOnlineSupport from '@merchant/components/FloatingOnlineSupport'
import { getAccount } from '../lib/mpSession'

const FAQS = [
  { q: '如何登录星选平台？', a: '使用小程序「我的信息」中设置的手机号与密码登录；开发预览可使用登录页「开发预览」入口。' },
  { q: '如何完善达人资料？', a: '进入「我的 → 我的信息」，填写抖音/小红书等平台粉丝、城市与品类标签，推荐大厅将据此智能匹配。' },
  { q: '如何报名商单？', a: '在招募大厅或推荐大厅打开商单详情，点击「一键报名」并提交报名表单。' },
  { q: '云剪任务如何接单？', a: '在云剪任务详情报名后，于「我的报名」确认接收并回传发布链接。' },
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
        customerId={acc?.lingqiTalentId || acc?.lingqiPrId || acc?.loginName || ''}
        enterpriseName={acc?.wxNickName || acc?.loginName || '灵祺星选用户'}
      />
    </div>
  )
}
