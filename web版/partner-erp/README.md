# 灵祺 Web · 服务商版

与 `../merchant-erp` 共用同一套前端源码，通过构建模式 `partner` 区分：

- **商家版**：`http://127.0.0.1:5173` — `cd ../merchant-erp && npm run dev`
- **服务商版**：`http://127.0.0.1:5175` — `npm run dev`（本目录）或 `cd ../merchant-erp && npm run dev:partner`

两端口会话与本地存储互不影响；登录页「切换到商家版/服务商版」为 **跳转到对端网站**（生产环境配 `VITE_PEER_EDITION_LOGIN_URL`）。

## Vercel 独立站点（与商家版两个项目、两个域名）

1. 新建 Vercel 项目（或单独 Production 域名），**Root Directory** 填：`web版/partner-erp`（不要用 `灵祺Web版:服务商版本`）。
2. 本目录 `vercel.json` 已写好 Install / Build / Output；或在控制台等价配置：
   - Install：`cd ../merchant-erp && npm ci`
   - Build：`npm run build`（内部 `build:partner` + 同步到 `dist/`）
   - Output：`dist`
3. 环境变量（必配）：
   - `VITE_APP_EDITION=partner`
   - `VITE_PEER_EDITION_LOGIN_URL` = 商家版登录页完整地址（如 `https://cs.mofangdianai.com/login`）
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_ERP_AUTH_API_BASE` 与商家站一致

商家版 Vercel 项目请设 `VITE_PEER_EDITION_LOGIN_URL` 指向服务商域名 `/login`。

详见：[`docs/deploy-vercel-partner.md`](../../docs/deploy-vercel-partner.md)

## 服务商版能力摘要

1. 注册/登录独立租户（`tenants.edition = partner`）
2. 设置 → **服务商平台**：绑定各平台服务商身份（`binding_role = service_provider`）
3. 设置 → **客户商家**：绑定代运营客户商家账号（`tenant_partner_clients`）
4. 顶栏客户切换：全部客户汇总 / 单一客户数据视图
5. 商品查询默认 `goods_query_type=3`（服务商）

部署前请在 Supabase 执行迁移：`supabase/migrations/20260601120000_tenant_partner_edition.sql`
