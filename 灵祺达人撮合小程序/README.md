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
4. 启动页为 `pages/login/login`：支持 **微信一键登录** 与 **账号密码登录**（与「灵祺达人履约管理后台」互通）

## 统一账号（一微信一账号）

- 登录走 `POST /api/meoo-ops-mp-auth`（`wx_login` / `password_login`）
- 服务端表 `mp_accounts`：`openid` 唯一，绑定唯一 `lingqiTalentId` / `lingqiPrId`
- 详见仓库 `灵祺达人履约管理后台/README.md`

## 生产部署（仅 ECS，无 Supabase 云 / 无 Vercel）

👉 **[ECS-小程序专用部署.md](./ECS-小程序专用部署.md)**

- API 唯一入口：`https://mofangdianai.com/erp-api`（ECS `meoo-auth-api`）
- `utils/config.release.js` 已固定上述地址；勿使用 `cs.mofangdianai.com` 或 `*.supabase.co`
- 旧文档 [DEPLOY.md](./DEPLOY.md) 含 Vercel 说明，**小程序已不再使用**

## 分享路径

运营在「商家达人招募订单」选择「小程序招募」后，分享路径为：

`pages/detail/detail?id={MP-RO-订单号}`

## 功能

- **招募大厅 / 急单大厅（开环）**：达人报名 → 运营反选 → 探店寄样 → 审核发布 → 结算
- **云剪任务大厅（闭环）**：云剪成片直派 → 达人**确认接收/拒绝** → 下载成片 → 发布抖音回链 → AI 核查 → 待结算
- **灵祺达人会员注册**：资料同步至 `mpTalentMembers` 与灵祺达人库

闭环云剪 API：`/api/meoo-ops-mp-recruitment-ice-confirm`（确认/拒绝）、`/api/meoo-ops-mp-recruitment-ice-submit`（回传抖音链接）

## PR ↔ 达人私信

消息/大厅/报名/登录均经 **ECS erp-api**（`utils/mpEcsClient.js`）。

- 消息 Tab：微信风格会话列表 + 聊天页（`pages/messages`、`pages/chat`）
- 数据：ECS PostgreSQL（非 Supabase 云）
- API：`POST /api/meoo-ops-mp-talent-chat` 等
- **PR**：推荐达人「沟通」、报名列表「私信沟通」、消息 Tab 会话列表
- **达人**：商单详情「联系招募方」（新发单含 `prParticipantKey`）、消息 Tab 回复 PR
- Tab「消息」角标为私信未读合计；`MP_CHAT_DEV_TEST: true` 可显示本地测试对话入口

## 上架前

在 `project.config.json` 中确认正式 `appid`；request 合法域名仅 `https://mofangdianai.com`。详见 [ECS-小程序专用部署.md](./ECS-小程序专用部署.md)。
