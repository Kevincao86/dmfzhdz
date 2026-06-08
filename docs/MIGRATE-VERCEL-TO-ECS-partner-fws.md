# 服务商 ERP · Vercel → 新 ECS（fws.mofangdianai.com）

与商家版 `cs.mofangdianai.com` **同机、同架构**：静态 SPA 在新 ECS，API/DB 在轻量。

## 机器分工

| 称呼 | IP | 职责 |
|------|-----|------|
| **轻量** | `139.196.42.5` | Supabase、`meoo-auth-api`、`mofangdianai.com/erp-api` |
| **ECS** | `8.160.173.236` | 商家 `cs` + 服务商 `fws` + 履约 `dr` |

浏览器访问 `https://fws.mofangdianai.com`：

- `/` → 服务商 `dist-partner`（新 ECS）
- `/api/*`、`/erp-api/*`、`/auth/v1/*`、`/rest/v1/*` → Nginx 反代 **轻量**（与 cs 一致）

**不再使用** 服务商 Vercel 项目或 `partner-erp/api/*` Serverless 反代。

---

## 步骤 1：DNS

| 主机记录 | 类型 | 值 |
|----------|------|-----|
| `fws` | A | `8.160.173.236` |

Vercel 已解绑 `fws` 后，删除仍指向 Vercel 的旧记录。

---

## 步骤 2：TLS 证书

证书目录：`/etc/nginx/ssl/fws.mofangdianai.com/`（阿里云 DV 或 `ecs-setup-ssl-fulfillment-domain.sh`）

---

## 步骤 3：环境变量 `web版/merchant-erp/.env.partner`

```bash
VITE_APP_EDITION=partner
VITE_PEER_EDITION_LOGIN_URL=https://cs.mofangdianai.com/login

VITE_SUPABASE_URL=https://mofangdianai.com
VITE_SUPABASE_ANON_KEY=<与 cs 相同 anon key>
VITE_ERP_AUTH_API_BASE=https://mofangdianai.com/erp-api
```

模板见 `.env.partner.example`。勿提交 Git。

商家版 `.env.production` 请设：

```bash
VITE_PEER_EDITION_LOGIN_URL=https://fws.mofangdianai.com/login
```

---

## 步骤 4：部署（admin，ECS 上执行）

```bash
cd ~/app && git pull
MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-partner-fws-web.sh
```

2G OOM：本机 `npm run build:partner` 后 `scp dist-partner`，再：

```bash
SKIP_BUILD=1 MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-partner-fws-web.sh
```

---

## 步骤 5：验收

```bash
curl -sI https://fws.mofangdianai.com/ | head -5
curl -sS "https://fws.mofangdianai.com/api/meoo-help-manual-public?edition=partner" | head -c 120
curl -sS https://fws.mofangdianai.com/api/meoo-auth-ping | head -c 80
```

浏览器 **https://fws.mofangdianai.com/help**（硬刷新）：帮助手册应与运营台「服务商版」Tab 同步。

---

## 日常发版（cs + fws 同机）

```bash
cd ~/app && git pull
MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-merchant-cs-web.sh
MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-partner-fws-web.sh
```

或本机一键：

```bash
bash scripts/ecs-deploy-light-and-cs-remote.sh
# DEPLOY_CS=1 DEPLOY_FWS=1（默认均开启）
```

---

## 与 cs / dr 同机注意

- Nginx 站点：`meoo-merchant-cs`、`meoo-partner-fws`、`meoo-talent-fulfillment` 并存
- 证书目录分开：`cs.mofangdianai.com/`、`fws.mofangdianai.com/`、`dr.mofangdianai.com/`

---

## 历史：Vercel 部署

旧文档 `docs/deploy-vercel-partner.md` 仅作归档；新环境一律 ECS。
