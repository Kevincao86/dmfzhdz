# 灵祺达人履约管理后台

与 **灵祺达人撮合小程序** 数据互通的 Web 端：同一账号体系（一微信一灵祺账号）、达人版/PR 版切换、招募大厅与履约状态只读/操作共用 `ops_registry_snapshot` 与 `/api/meoo-ops-mp-*`。

## 本地开发

```bash
# 终端 1：商家 ERP（提供 /api 网关）
cd web版/merchant-erp && npm run dev

# 终端 2：履约后台
cd 灵祺达人履约管理后台 && npm install && npm run dev
```

浏览器打开 http://127.0.0.1:5176

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
