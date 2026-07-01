# 灵祺达人履约管理后台

与 **灵祺达人撮合小程序** 数据互通的 Web 端：同一账号体系（一微信一灵祺账号）、达人版/PR 版切换、招募大厅与履约状态只读/操作共用 `ops_registry_snapshot` 与 `/api/meoo-ops-mp-*`。

## 本地开发

```bash
# 履约后台（已内置商家版 API 网关，无需另开 5173）
cd 灵祺达人履约管理后台 && npm install && npm run dev
```

浏览器打开 http://127.0.0.1:5176

## 增值服务（商家版功能嵌入）

侧栏 **增值服务** 直接复用 `web版/merchant-erp` 同源页面（非外链跳转）：

| Tab | 商家页面 |
|-----|----------|
| 短视频AI处理 | `ShortVideoOptimizationPage` |
| AI 文章与话题 | `AiOperationContentPage` |
| 数字人口播 | `DigitalHumanBroadcastPage` |

本地 dev 在 5176 端口内置商家 `/api` 网关（`merchantApiMock` 等），环境变量从 `web版/merchant-erp/.env*` 读取。  
「AI 文章与话题」需商家抖音来客 token（`meoo_douyin_merchant_token`），与商家版相同。

**增值服务灰测**：在 `.env.production`（或本地 `.env.local`）配置 `VITE_MP_ADDON_BETA_ALLOWLIST`，填入灰测用户的 `accountId`、`loginName`、`lingqiTalentId` 或 `lingqiPrId`（逗号分隔）。未命中白名单的登录用户进入「增值服务」将看到「即将开放使用」。全量开放后设 `VITE_MP_ADDON_OPEN_ALL=true`。

构建时会将 `web版/merchant-erp/public`（`digital-human`、`ai-vendors` 等）合并进 `dist`，与商家 Web 静态资源路径一致。

## 登录方式

| 方式 | 说明 |
|------|------|
| 账号密码 | `POST /api/meoo-ops-mp-auth` · `password_login` |
| 扫码登录 · 微信 | `scan_create` + `scan_poll`（微信开放平台网站应用审核通过后启用） |
| 扫码登录 · 抖音 | `dy_oauth_begin` + OAuth 回调 `dy_oauth_complete`（见下） |
| 小程序 | `wx_login` / `dy_login` 同一接口，会话 token 可互通（`X-Mp-Session`） |

### 抖音网站扫码登录（星选 Web · dr）

1. 登录 [抖音开放平台](https://developer.open-douyin.com/) → **控制台** → **我的应用** → 创建 **网站应用**（与小程序应用分开）。
2. **应用信息** 复制 **Client Key**、**Client Secret**。
3. **授权回调** 添加（须 `https`，且与下方变量完全一致）：
   ```
   https://dr.mofangdianai.com/login/dy-oauth
   ```
4. 申请 **user_info** 授权 scope（扫码登录默认需要）。
5. 在 **轻量** auth-api 环境（如 `~/stack/auth-api.env`）增加：
   ```bash
   MP_DOUYIN_WEB_CLIENT_KEY=你的ClientKey
   MP_DOUYIN_WEB_CLIENT_SECRET=你的ClientSecret
   MP_DOUYIN_WEB_REDIRECT_URI=https://dr.mofangdianai.com/login/dy-oauth
   ```
6. 部署轻量 auth-api 后，星选登录页 → **扫码登录** → **抖音扫码** 即可加载授权页。

> **扫码方式（重要）**：须嵌入/打开 `open.douyin.com` **官方授权页**，扫页面内抖音提供的二维码。平台禁止对 Web 授权链接自行生成二维码（见[公告 134](https://developer.open-douyin.com/announcement/134)）。

**若官方页提示 `Illegal redirect link` / 非法重定向：**

1. 登录页黄框会显示当前 `redirect_uri` 与 `Client Key`，须与 **灵祺科技 → 设置 → 开发设置 → 授权回调** 中某条 **逐字一致**（建议同时添加带/不带尾斜杠两条）。
2. 检查 **应用信息 → 官网/网站地址** 是否为 `https://dr.mofangdianai.com` 或包含该域名。
3. 删除旧回调后重新粘贴保存，等待 2～3 分钟再试。
4. 仍失败：抖音开放平台提工单，附上 Client Key 与 redirect_uri。

文档：[手机号和扫码登录授权](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/sdk/web-app/web/permission)

> 说明：网站应用 open_id 与抖音**小程序** open_id 不同应用，首次抖音 Web 扫码会新建账号；与小程序同一人可通过手机号密码绑定同一灵祺 ID。

## 生产部署

| 方式 | 文档 / 命令 |
|------|-------------|
| Vercel（迁出前） | [docs/deploy-vercel-talent-fulfillment.md](../docs/deploy-vercel-talent-fulfillment.md) |
| ECS（推荐） | [docs/MIGRATE-VERCEL-TO-ECS-talent-fulfillment.md](../docs/MIGRATE-VERCEL-TO-ECS-talent-fulfillment.md) · `bash scripts/ecs-deploy-talent-fulfillment-web.sh` |

Root Directory（Vercel）必须为 `灵祺达人履约管理后台`，并配置 `VITE_MP_API_BASE`。ECS 构建用本目录 `.env.production`（见 `.env.production.example`）。

## 环境变量（ECS / Vercel）

| 端 | 变量 |
|----|------|
| Vercel 前端 | `VITE_MP_API_BASE`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` |
| ECS auth-api | `MP_WECHAT_APPID` / `MP_WECHAT_SECRET`、`MP_AUTH_PEPPER`；抖音小程序 `MP_DOUYIN_SECRET`；抖音 Web 扫码 `MP_DOUYIN_WEB_CLIENT_KEY` / `MP_DOUYIN_WEB_CLIENT_SECRET` / `MP_DOUYIN_WEB_REDIRECT_URI`；可选 `MP_AUTH_DEV_MODE=true` |

## 数据库

执行迁移：`supabase/migrations/20260603120000_mp_account_auth.sql`

- `mp_accounts` — 唯一 `openid`，绑定 `lingqi_talent_id` / `lingqi_pr_id`
- `mp_auth_sessions` — Web/小程序会话
- `mp_wx_scan_tickets` — 扫码登录票据
- `mp_account_client_state` — 本机态云端同步（草稿/报名/通知）；`client_state_sync`
