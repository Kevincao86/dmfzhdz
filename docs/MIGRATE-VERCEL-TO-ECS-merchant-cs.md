# 商家 ERP · Vercel → 新 ECS（cs.mofangdianai.com）

## 机器分工

| 称呼 | IP | 职责 |
|------|-----|------|
| **轻量** | `139.196.42.5` | Supabase、`meoo-auth-api`、`mofangdianai.com/erp-api` |
| **ECS** | `8.160.173.236` | 商家 Web `cs.mofangdianai.com`、服务商 `fws.mofangdianai.com`、履约 `dr.mofangdianai.com` |

浏览器访问 `https://cs.mofangdianai.com`：

- `/` → 商家 `dist`（新 ECS）
- `/api/*`、`/erp-api/*` → Nginx 反代 **轻量** `https://mofangdianai.com`（与 Vercel 时期逻辑一致，API 不在新 ECS 本机跑）

---

## 步骤 1：DNS

| 主机记录 | 类型 | 值 |
|----------|------|-----|
| `cs` | A | `8.160.173.236` |

Vercel 已解绑 `cs` 后，删除仍指向 Vercel 的旧记录。

---

## 步骤 2：TLS 证书

**推荐：阿里云免费 DV**（与 dr 相同，避免 Let's Encrypt 限流）

1. 申请 `cs.mofangdianai.com` 免费证书并下载 Nginx 格式
2. 本机 `scp` 到新 ECS `/etc/nginx/ssl/cs.mofangdianai.com/`

或 root 尝试脚本（可能受 LE 限流影响）：

```bash
bash /home/admin/app/scripts/ecs-setup-ssl-fulfillment-domain.sh cs.mofangdianai.com
```

---

## 步骤 3：环境变量 `web版/merchant-erp/.env.production`

从原 **商家版 Vercel 项目** Production 变量抄写，或从轻量/履约对照：

```bash
VITE_SUPABASE_URL=https://mofangdianai.com
VITE_SUPABASE_ANON_KEY=<必填>
VITE_ERP_AUTH_API_BASE=https://mofangdianai.com/erp-api
# 留空：浏览器走 cs 同源 /api/*（Nginx 反代轻量）
# VITE_MERCHANT_API_BASE_URL=

# 服务商版登录跳转（fws 与 cs 同机 ECS）
VITE_PEER_EDITION_LOGIN_URL=https://fws.mofangdianai.com/login
```

勿提交 Git。

---

## 步骤 4：部署（admin）

```bash
cd ~/app && git pull

# 确保仓库归属 admin（若曾用 root pull）
sudo chown -R admin:admin ~/app

MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-merchant-cs-web.sh
```

2G 内存 OOM：本机 `npm run build` 后 `scp dist`，再：

```bash
SKIP_BUILD=1 MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-merchant-cs-web.sh
```

---

## 步骤 5：验收

```bash
curl -sI https://cs.mofangdianai.com/ | head -5
curl -sS https://cs.mofangdianai.com/api/meoo-auth-ping | head -c 80
```

浏览器 **https://cs.mofangdianai.com**（硬刷新）：

1. 登录 / 注册（勿动注册 UI，只验 API）
2. 智能体、商品、抖音绑定任点一项
3. Network：`/api/meoo-*` 或 `/erp-api/meoo-*` 返回 200，非 502

---

## 日常发版

```bash
cd ~/app && git pull
MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-merchant-cs-web.sh
```

---

## 与 dr / fws 同机注意

- `dr`、`cs`、`fws` 各一个 Nginx 站点：`meoo-talent-fulfillment`、`meoo-merchant-cs`、`meoo-partner-fws`
- 证书目录分开：`/etc/nginx/ssl/dr.mofangdianai.com/`、`/etc/nginx/ssl/cs.mofangdianai.com/`、`/etc/nginx/ssl/fws.mofangdianai.com/`
- 改完 `cs` 后勿删除 `dr` / `fws` 的 sites-enabled
- 服务商发版：`bash scripts/ecs-deploy-partner-fws-web.sh`（见 `docs/MIGRATE-VERCEL-TO-ECS-partner-fws.md`）

---

## 常见问题

**Q：/api 502？**  
轻量 `meoo-auth-api` 是否运行：`bash ~/app/scripts/ecs-deploy-auth-api.sh`（在轻量执行）。

**Q：Supabase 报错？**  
`VITE_SUPABASE_URL` 仍为 `https://mofangdianai.com`（轻量 PostgREST），不是 `cs` 子域。

**Q：git pull 权限错误？**  
`sudo chown -R admin:admin ~/app`
