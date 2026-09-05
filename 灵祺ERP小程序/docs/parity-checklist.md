# 商家 ERP 小程序 ↔ Web 功能对账

> 真源：`web版/merchant-erp/src/config/nav.ts`  
> 菜单：`灵祺ERP小程序/utils/menuFunctions.js`  
> 范围：`erp_merchant_mp`

| Web 路由 | Web 名称 | MP 路径 | 状态 | 备注 |
|---------|---------|---------|------|------|
| `/home` | 首页 | `pages/dashboard/dashboard` | 对齐 | Tab「经营概览」 |
| `/ai-agent` | AI 智能体 | `pages/agent/agent` | 对齐 | Tab「灵祺助手」 |
| `/knowledge-base` | 我的知识库 | `pages/knowledge-base/knowledge-base` | 已补 | 列表/投喂文本 |
| `/store/info` | 店铺信息 | `pages/store-list/store-list?mode=info` | 对齐 | |
| `/store/analysis` | 店铺分析 | `pages/store-analysis/store-analysis` | 对齐 | |
| `/store/menu` | 菜单价目表 | `pages/store-menu/store-menu` | 对齐 | |
| `/store/decoration` | 店铺装修 | `pages/store-list/store-list?mode=decoration` | 对齐 | |
| `/products` | 商品 | `pages/product-create` / `product-list` / `product-edit` | 对齐 | |
| — | 语音建品 | `pages/product-voice/product-voice` | MP 独有 | 保留 |
| `/recruitment` | 达人招募 | `pages/recruit-hub` + 子流 | 对齐 | 子页更细 |
| `/activity` | 活动中心 | `pages/activity-center/activity-center` | 对齐 | |
| `/reviews` | 评价管理 | `pages/reviews-list/reviews-list` | 对齐 | |
| `/geo` | GEO运营优化 | `pages/geo-assist/geo-assist` | 对齐 | |
| `/operation/competitors` | 竞争对手分析 | `pages/competitors/competitors` | 对齐 | |
| `/operation/site-selection` | 选址参考 | `pages/site-selection/site-selection` | 已补 | `/api/meoo-site-selection` |
| `/operation/ai-ops-plan` | AI运营方案 | `pages/ai-ops-plan/ai-ops-plan` | 对齐 | |
| `/ai-image` | AI视觉工坊 | `pages/ai-visual-studio/ai-visual-studio` | 对齐 | |
| `/ai-operation/content` | 爆款Brief | `pages/ai-content/ai-content` | 对齐 | |
| `/ai-operation/video-check` | 短视频AI | `pages/shortvideo-ai` + voice/edit | 对齐 | |
| `/ai-operation/digital-human` | 数字人口播 | `pages/digital-human/digital-human` | 对齐 | |
| `/advertising` | 投流 | `pages/ads-manage/ads-manage` | 对齐 | |
| `/leads` | 线索 | `pages/leads-center/leads-center` | 对齐 | |
| `/finance` | 财务对账 | `pages/finance-reconcile/finance-reconcile` | 对齐 | |
| `/finance/tax` | 报税管理 | `pages/finance-tax/finance-tax` | 对齐 | |
| `/settings` | 系统 | `pages/settings/settings` | 已补 | 深度绑定引导 Web |
| `/wallet` | 钱包 | `pages/wallet/wallet` | 对齐 | 我的入口 |

## 使用规则（空态/门禁）

1. 未登录：业务页提示登录；功能 Tab 可游客浏览。
2. 免费版受限能力：点用提示升级（`membershipMp`）。
3. 平台未绑定：设置页展示状态，引导电脑端 `cs.mofangdianai.com` 完成授权。
4. 写操作走既有 ECS/商家 API，本期不新开后端。
