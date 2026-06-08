# 灵祺 Web · 服务商版

与 `../merchant-erp` 共用同一套前端源码，通过构建模式 `partner` 区分：

- **商家版**：`http://127.0.0.1:5173` — `cd ../merchant-erp && npm run dev`
- **服务商版**：`http://127.0.0.1:5175` — `npm run dev`（本目录）或 `cd ../merchant-erp && npm run dev:partner`

两端口会话与本地存储互不影响；登录页「切换到商家版/服务商版」为 **跳转到对端网站**（生产环境配 `VITE_PEER_EDITION_LOGIN_URL`）。

## 生产部署（ECS，与商家 cs 同机）

**域名**：`https://fws.mofangdianai.com`  
**构建产物**：`../merchant-erp/dist-partner`  
**环境变量**：`../merchant-erp/.env.partner`（见 `.env.partner.example`）

```bash
cd ~/app && git pull
MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-partner-fws-web.sh
```

详见：[`docs/MIGRATE-VERCEL-TO-ECS-partner-fws.md`](../../docs/MIGRATE-VERCEL-TO-ECS-partner-fws.md)

商家版 `.env.production` 请设 `VITE_PEER_EDITION_LOGIN_URL=https://fws.mofangdianai.com/login`。

### 历史：Vercel 独立站点

`vercel.json` 与 `api/*` 仅作归档；新环境不再使用 Vercel。旧说明见 [`docs/deploy-vercel-partner.md`](../../docs/deploy-vercel-partner.md)。

## 服务商版能力摘要

1. 注册/登录独立租户（`tenants.edition = partner`）
2. 设置 → **服务商平台**：绑定各平台服务商身份（`binding_role = service_provider`）
3. 设置 → **客户商家**：绑定代运营客户商家账号（`tenant_partner_clients`）
4. 顶栏客户切换：全部客户汇总 / 单一客户数据视图
5. 商品查询默认 `goods_query_type=3`（服务商）

部署前请在 Supabase 执行迁移：`supabase/migrations/20260601120000_tenant_partner_edition.sql`
