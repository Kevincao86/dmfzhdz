# 灵祺达人招募小程序

供达人查看商家招募要求并报名；数据与运营管控台「小程序达人招募订单」、商家 ERP 注册表（`ops_registry_snapshot`）同步。

## 底部导航

| Tab | 说明 |
|-----|------|
| 首页 | 招募大厅 / 急单大厅 / 云剪任务 |
| 推荐 | 优质达人名单（达人库 + 会员） |
| 发招募 | PR 身份发单（默认模版 / 自定义模版） |
| 消息 | 我的消息 |
| 我的 | 达人 / PR 双身份切换与功能菜单 |

达人菜单：我的信息、我的报名、我的模版、消息通知、数据分析、小灵同学。  
PR 菜单：PR 信息、我的发单、我的模版等。

## 快速开始（本地）

1. 复制 `utils/config.local.example.js` 为 `utils/config.local.js`
2. 填写 `MERCHANT_API_BASE_URL`（与 Web 商家 ERP 相同，如 `http://局域网IP:5173`）
3. 微信开发者工具打开本目录 → 详情 → 本地设置 → 勾选「不校验合法域名」

## 生产部署

**GitHub + Vercel（API）与微信上架（小程序）** 分步说明见：

👉 **[DEPLOY.md](./DEPLOY.md)**

要点：

- 后端：仓库根 `vercel.json` 部署商家 ERP，小程序请求其 HTTPS 根地址下的 `/api/meoo-ops-*`
- 小程序：配置 `utils/config.release.js`（见 `config.release.example.js`）+ 微信公众平台 request 合法域名 + 开发者工具上传

## 分享路径

运营在「商家达人招募订单」选择「小程序招募」后，分享路径为：

`pages/detail/detail?id={MP-RO-订单号}`

## 功能

- **招募大厅 / 急单大厅（开环）**：达人报名 → 运营反选 → 探店寄样 → 审核发布 → 结算
- **云剪任务大厅（闭环）**：云剪成片直派 → 达人**确认接收/拒绝** → 下载成片 → 发布抖音回链 → AI 核查 → 待结算
- **灵祺达人会员注册**：资料同步至 `mpTalentMembers` 与灵祺达人库

闭环云剪 API：`/api/meoo-ops-mp-recruitment-ice-confirm`（确认/拒绝）、`/api/meoo-ops-mp-recruitment-ice-submit`（回传抖音链接）

## PR ↔ 达人私信（Supabase）

本地消息 Tab 若报「无法连接 Supabase」：检查 `web版/merchant-erp/.env.local` 的 `SUPABASE_URL` 是否可达。  
- **本地库**：`http://127.0.0.1:54321` 需先启动 Docker，在项目根执行 `supabase start`，并执行迁移 `20260528100000_mp_talent_chat.sql`。  
- **云端库**：填写与迁移相同的 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`，重启 `npm run dev`。

- 消息 Tab：微信风格会话列表 + 聊天页（`pages/messages`、`pages/chat`）
- 数据表：`mp_talent_chat_participants` / `mp_talent_chat_sessions` / `mp_talent_chat_messages`（迁移 `20260528100000_mp_talent_chat.sql`）
- API：`POST /api/meoo-ops-mp-talent-chat`（`sync_profile` / `list_sessions` / `ensure_session` / `ensure_session_from_talent` / `fetch_messages` / `send_message` / `mark_read`）
- 可选直连：在 `config.local.js` 配置 `SUPABASE_URL` + `SUPABASE_ANON_KEY` 走 RPC；聊天页 2.5s 轮询同步（表已加入 Realtime publication）
- **PR**：推荐达人「沟通」、报名列表「私信沟通」、消息 Tab 会话列表
- **达人**：商单详情「联系招募方」（新发单含 `prParticipantKey`）、消息 Tab 回复 PR
- Tab「消息」角标为私信未读合计；`MP_CHAT_DEV_TEST: true` 可显示本地测试对话入口

## 上架前

在 `project.config.json` 中确认正式 `appid`，并配置 request 合法域名指向生产 API（须 HTTPS）。详见 [DEPLOY.md](./DEPLOY.md)。
