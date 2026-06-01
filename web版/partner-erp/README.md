# 灵祺 Web · 服务商版

与 `../merchant-erp` 共用同一套前端源码，通过构建模式 `partner` 区分：

- **商家版**：`http://127.0.0.1:5173` — `cd ../merchant-erp && npm run dev`
- **服务商版**：`http://127.0.0.1:5175` — `npm run dev`（本目录）或 `cd ../merchant-erp && npm run dev:partner`

两端口会话与本地存储互不影响；登录页右上角可切换到对端。

## 服务商版能力摘要

1. 注册/登录独立租户（`tenants.edition = partner`）
2. 设置 → **服务商平台**：绑定各平台服务商身份（`binding_role = service_provider`）
3. 设置 → **客户商家**：绑定代运营客户商家账号（`tenant_partner_clients`）
4. 顶栏客户切换：全部客户汇总 / 单一客户数据视图
5. 商品查询默认 `goods_query_type=3`（服务商）

部署前请在 Supabase 执行迁移：`supabase/migrations/20260601120000_tenant_partner_edition.sql`
