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

## 登录方式

| 方式 | 说明 |
|------|------|
| 账号密码 | `POST /api/meoo-ops-mp-auth` · `password_login` |
| 微信扫码 | `scan_create` + `scan_poll`（资质齐全后接微信开放平台） |
| 小程序 | `wx_login` 同一接口，会话 token 可互通（`X-Mp-Session`） |

## 环境变量（ECS / Vercel）

- `MP_WECHAT_APPID` / `MP_WECHAT_SECRET` — 小程序 code2session
- `MP_AUTH_DEV_MODE=true` — 无微信密钥时用 code 派生 dev openid
- `MP_AUTH_PEPPER` — 密码哈希胡椒

## 数据库

执行迁移：`supabase/migrations/20260603120000_mp_account_auth.sql`

- `mp_accounts` — 唯一 `openid`，绑定 `lingqi_talent_id` / `lingqi_pr_id`
- `mp_auth_sessions` — Web/小程序会话
- `mp_wx_scan_tickets` — 扫码登录票据
