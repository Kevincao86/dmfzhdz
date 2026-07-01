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

## 代码质量（图片 ≤200KB）

**必须用微信开发者工具打开本目录**（`灵祺达人撮合小程序`），不要打开上一级 `项目` 文件夹，否则会把整个仓库里其它 Web 项目的大图也算进扫描。

登录环墙样片：`orbit-01~06.jpg`（520px 环墙）+ `orbit-01~06-hd.jpg`（960px 点开大图）。勿留 `orbit-*.png`。

在仓库根目录 `项目` 下可执行：

```bash
bash scripts/mp-miniprogram-media-fix.sh
```

或进入本目录后：

```bash
bash scripts/mp-compress-orbit-images.sh
```

然后：开发者工具 **清缓存 → 重新编译 → 上传** → 在「代码质量」点 **重新扫描**（时间戳应更新）。

## 快速开始（本地）

1. 复制 `utils/config.local.example.js` 为 `utils/config.local.js`
2. 填写 `MERCHANT_API_BASE_URL`（与 Web 商家 ERP 相同，如 `http://局域网IP:5173`）
3. 微信开发者工具打开本目录 → 详情 → 本地设置 → 勾选「不校验合法域名」
4. 启动页为 `pages/login/login`：支持 **微信一键登录** 与 **账号密码登录**（与「灵祺达人履约管理后台」互通）

## 统一账号（一微信一账号）

- 登录走 `POST /api/meoo-ops-mp-auth`（`wx_login` / `password_login`）
- 服务端表 `mp_accounts`：`openid` 唯一，绑定唯一 `lingqiTalentId` / `lingqiPrId`
- 本机态同步：`utils/mpAccountClientSync.js` → `client_state_sync`（与履约 Web 共享）
- 详见仓库 `灵祺达人履约管理后台/README.md`

## 生产部署（仅 ECS，无 Supabase 云 / 无 Vercel）

👉 **[ECS.md](./ECS.md)**

- API：`https://mofangdianai.com/erp-api`
- 网络层：`utils/ecs.js` + `utils/api.js` + `utils/auth.js`（无 Vercel / Supabase 云 / 网关）

## 分享路径

运营在「商家达人招募订单」选择「小程序招募」后，分享路径为：

`pages/subpack-core/detail/detail?id={MP-RO-订单号}`

## 功能

- **招募大厅 / 急单大厅（开环）**：达人报名 → 运营反选 → 探店寄样 → 审核发布 → 结算
- **云剪任务大厅（闭环）**：云剪成片直派 → 达人**确认接收/拒绝** → 下载成片 → 发布抖音回链 → AI 核查 → 待结算
- **灵祺达人会员注册**：资料同步至 `mpTalentMembers` 与灵祺达人库

闭环云剪 API：`/api/meoo-ops-mp-recruitment-ice-confirm`（确认/拒绝）、`/api/meoo-ops-mp-recruitment-ice-submit`（回传抖音链接）

## PR ↔ 达人私信

消息/大厅/报名/登录均经 **ECS erp-api**（`utils/ecs.js`）。

- 消息 Tab：微信风格会话列表 + 聊天页（`pages/messages`、`pages/chat`）
- 数据：ECS PostgreSQL（非 Supabase 云）
- API：`POST /api/meoo-ops-mp-talent-chat` 等
- **PR**：推荐达人「沟通」、报名列表「私信沟通」、消息 Tab 会话列表
- **达人**：商单详情「联系招募方」（新发单含 `prParticipantKey`）、消息 Tab 回复 PR
- Tab「消息」角标为私信未读合计；`MP_CHAT_DEV_TEST: true` 可显示本地测试对话入口

## 上架前

在 `project.config.json` 中确认正式 `appid`；request 合法域名仅 `https://mofangdianai.com`。详见 [ECS-小程序专用部署.md](./ECS-小程序专用部署.md)。
