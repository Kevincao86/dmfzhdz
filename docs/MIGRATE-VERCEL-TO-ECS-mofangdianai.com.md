# Vercel 迁移至 ECS（域名 `mofangdianai.com`）

国内迁移收尾：数据与 API 已在 ECS，代码在 Gitee。本文把 **原 Vercel 项目（商家 ERP `cs.mofangdianai.com` + 根目录 `api/*`）** 迁到 **同一台 ECS、同一域名 `mofangdianai.com`**。

---

## 迁移后架构

| 访问路径 | 服务 |
|----------|------|
| `https://mofangdianai.com/` | Nginx → `web版/merchant-erp/dist`（商家 ERP 静态页） |
| `https://mofangdianai.com/api/*` | Nginx → `127.0.0.1:3001/api/*`（`meoo-auth-api`） |
| `https://mofangdianai.com/erp-api/*` | 同上（与现网一致，小程序也在用） |
| `https://mofangdianai.com/rest/v1/*` | PostgREST :3000 |
| `https://mofangdianai.com/auth/v1/*` | GoTrue :9999 |
| 达人撮合小程序 | **仅** `https://mofangdianai.com/erp-api`（不经 Vercel） |

发版：`Gitee push` → ECS `git pull` → `bash scripts/ecs-deploy-merchant-web-mofangdianai.sh`

---

## 阶段 0：截止 Vercel 前 — 拉取全部环境变量

### 方式 A：Vercel CLI（推荐，可一次性导出）

在**本机**（已登录 Vercel 账号）：

```bash
# 安装 CLI（若未安装）
npm i -g vercel

# 进入仓库根目录（绑定过 Vercel 的项目）
cd /path/to/linqierp

# 链接项目（按提示选择 Team / Project，对应 cs.mofangdianai.com 的那个）
vercel link

# 导出 Production 环境变量到本地文件（勿提交 git）
vercel env pull .env.vercel.production --environment=production

# 若有 Preview / Development 也需要备份
vercel env pull .env.vercel.preview --environment=preview
vercel env pull .env.vercel.development --environment=development

# 在 Dashboard 查看变量名列表（不显示值）
vercel env ls production
```

将 `.env.vercel.production` **scp 到 ECS**（勿进 Git）：

```bash
scp .env.vercel.production admin@<ECS公网IP>:~/stack/vercel-export.production.env
```

### 方式 B：Vercel 控制台（无 CLI 时）

1. 打开 [vercel.com](https://vercel.com) → 对应项目（商家 ERP / 根仓库部署）
2. **Settings → Environment Variables**
3. 筛选 **Production**，逐页复制或截图变量名
4. 使用 **Export**（若团队套餐提供）或手动整理为 `KEY=VALUE` 文件

### 方式 C：核对仓库清单（防漏）

对照 `web版/merchant-erp/.env.example` 与下表，确认 Vercel 上是否配置过：

| 分类 | 常见变量名 |
|------|------------|
| Supabase / ECS | `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `JWT_SECRET` |
| ERP API | `VITE_ERP_AUTH_API_BASE`, `VITE_MERCHANT_API_BASE_URL`, `MEOO_ERP_API_BASE`, `MEOO_ERP_API_HOST_IP` |
| 抖音 | `MERCHANT_DOUYIN_SESSION_SECRET`, `DOUYIN_OPENAPI_*`, `MERCHANT_DOUYIN_*` |
| 阿里云 OSS/ICE/短信 | `MERCHANT_PRODUCT_IMAGE_OSS_*`, `ALIYUN_*`, `ALIBABA_CLOUD_*` |
| AI | `TOKENMIX_*`, `DEEPSEEK_*`, `MOONSHOT_*`, `MINIMAX_*`, `MERCHANT_AI_*`, `DASHSCOPE_*`, `ARK_*` |
| 美团/小红书/巨量 | `MEITUAN_*`, `XHS_*`, `OCEANENGINE_*` |
| 运营/审计 | `MEOO_SUPPORT_OPS_HTTP_TOKEN`, `MERCHANT_ADMIN_AI_AUDIT_URL`, `MEOO_AI_AGENT_AUDIT_SECRET`, `VITE_MERCHANT_ADMIN_ORIGIN` |
| 飞书 | `MEOO_FEISHU_*` |

---

## 阶段 1：环境变量写入 ECS（两份文件）

### 1）服务端 API：`~/stack/auth-api.env`

已有文件由 `scripts/ecs-run-auth-api.sh` 生成 Supabase 三件套。将 **Vercel 导出的服务端变量** 追加进去（无 `VITE_` 前缀的项）：

```bash
# ECS 上
nano ~/stack/auth-api.env
# 或合并导出文件（去掉 VITE_ 行后追加）
grep -v '^VITE_' ~/stack/vercel-export.production.env >> ~/stack/auth-api.env
# 去重、手工删掉与本地 127.0.0.1 冲突的 SUPABASE_URL（auth-api 本机应保留 127.0.0.1:8888）
```

**注意：**

- `auth-api.env` 里 `SUPABASE_URL` 建议保持 **`http://127.0.0.1:8888`**（本机 PostgREST），不要用公网域名，减少绕路。
- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` 必须与 `~/stack/db-credentials.txt` 一致。
- 合并后执行：`sudo systemctl restart meoo-auth-api`

### 2）前端构建：`~/app/web版/merchant-erp/.env.production`

仅 **构建时** 使用（可不进 Git，在 ECS 或本机构建）：

```bash
VITE_SUPABASE_URL=https://mofangdianai.com
VITE_SUPABASE_ANON_KEY=<与 auth-api.env 中 SUPABASE_ANON_KEY 相同>
VITE_ERP_AUTH_API_BASE=https://mofangdianai.com/erp-api
# 留空：浏览器走同源 /api/* 与 /erp-api/*
# VITE_MERCHANT_API_BASE_URL=
```

从 Vercel 导出中 **只取 `VITE_*`** 写入 `.env.production`（若与上冲突，以「根域 ECS」为准）。

---

## 阶段 2：DNS 与证书

1. **DNS**：`mofangdianai.com`（及如需 `www`）**A 记录** → ECS 公网 IP（已做可跳过）。
2. **证书**：`fullchain.pem` 须覆盖 `mofangdianai.com`（现有阿里云 PEM 或 certbot）。
3. **可选**：`api.mofangdianai.com` A 记录同 IP（小程序 Cronet 备用）。

```bash
sudo bash ~/app/scripts/ecs-fix-wechat-https-443.sh mofangdianai.com
```

---

## 阶段 3：部署 Nginx + 商家 Web

```bash
cd ~/app && git pull

# 部署静态站 + /api 反代 + 更新 nginx 配置
sudo bash scripts/ecs-deploy-merchant-web-mofangdianai.sh

# 确保 auth-api 最新路由
bash scripts/ecs-fix-erp-api-502.sh
```

脚本会：

- `npm ci && npm run build`（读取 `.env.production`）
- 安装 `scripts/ecs-meoo-api.nginx.conf`（含根域静态 SPA）
- `nginx -t && reload`

---

## 阶段 4：验收（切流前）

在 ECS 或本机执行：

```bash
# API
curl -s https://mofangdianai.com/erp-api/meoo-erp-api-health

# 商家 Web 首页（应返回 HTML，非 JSON）
curl -sI https://mofangdianai.com/ | head -5

# 同源 API（示例）
curl -s https://mofangdianai.com/api/meoo-auth-ping
```

浏览器：

1. 打开 `https://mofangdianai.com` → 登录商家 ERP  
2. 智能体、抖音绑定、商品保存各点一次  
3. 小程序仍测 `https://mofangdianai.com/erp-api/meoo-erp-api-health`（与 Web 同域）

---

## 阶段 5：下线 Vercel

1. **DNS**：若 `cs.mofangdianai.com` 仍指 Vercel，改为 **A → ECS** 或 **CNAME 停用**（可 301 到 `mofangdianai.com`）。
2. Vercel 项目 → Settings → 可 **Pause** 或保留只读备份。
3. 删除本机 `.env.vercel.*` 的远程副本时注意保密。
4. 更新团队文档：生产入口统一为 **`https://mofangdianai.com`**。

---

## 其它 Vercel 项目（按需）

| 目录 | 说明 |
|------|------|
| `商家管理后台/` | 运营台，单独 `vercel.json`，可迁 `admin.*` 子域或同 ECS |
| `web版/partner-erp/` | 服务商版 |
| `商业BP/` | 静态 BP，已可复制到 `dist/bp`，根域 `/bp/` 访问 |

每个项目重复 **阶段 0 导出 env** + Nginx 子域或路径。

---

## 常见问题

**Q：Vercel env pull 报未登录？**  
`vercel login` 后重试，或在网页端手动导出。

**Q：合并 env 后 auth-api 502？**  
`sudo journalctl -u meoo-auth-api -n 50`，检查是否误把 `SUPABASE_URL` 改成公网 URL 且本机 PostgREST 未起。

**Q：页面空白 / 404？**  
确认 `dist/index.html` 存在，`location /` 使用 `try_files`，且未盖住 `/erp-api/`。

**Q：是否还要 cs.mofangdianai.com？**  
不必；统一 `mofangdianai.com` 即可。旧域名可做 301 跳转。

---

## 一键命令备忘（ECS admin）

```bash
cd ~/app && git pull
sudo bash scripts/ecs-deploy-merchant-web-mofangdianai.sh
bash scripts/ecs-fix-erp-api-502.sh
curl -s https://mofangdianai.com/erp-api/meoo-erp-api-health
```
