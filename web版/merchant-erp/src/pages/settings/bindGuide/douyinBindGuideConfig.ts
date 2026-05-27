import type { BindGuideConfig } from './bindGuideTypes'
import {
  DOUYIN_BIND_ERP_STEP,
  DOUYIN_BIND_GUIDE_PHASES,
  DOUYIN_BIND_GUIDE_STEPS,
} from '../douyinBindGuideSteps'

export const DOUYIN_BIND_GUIDE: BindGuideConfig = {
  introTitle: '绑定前请准备',
  introBullets: [
    '抖音来客超级管理员账号、抖音开放平台企业账号。',
    '约 15～30 分钟完成应用创建、能力开通与 IP 白名单配置。',
    '下列步骤与截图一一对应，建议按顺序操作。',
  ],
  phases: [...DOUYIN_BIND_GUIDE_PHASES],
  steps: DOUYIN_BIND_GUIDE_STEPS.map((s) => ({
    id: s.id,
    phase: s.phase,
    title: s.title,
    bullets: s.bullets,
    imageSrc: s.imageSrc,
    imageAlt: s.imageAlt,
    note: s.note,
  })),
  erpPhaseLabel: '三、灵祺 ERP 绑定',
  erpStep: DOUYIN_BIND_ERP_STEP,
}
