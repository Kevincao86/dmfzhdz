# 履约管理后台 · Vercel → 新 ECS 迁移（并行期不关 Vercel）

## 机器分工（术语）

| 称呼 | IP | 职责 |
|------|-----|------|
| **轻量** | `139.196.42.5` | Supabase、PostgREST、GoTrue、`meoo-auth-api`、`mofangdianai.com/erp-api` |
| **ECS**（新 ECS） | `8.160.173.236` | 履约 Web 静态站 + Nginx（本迁移只动这台的 Web） |
| **Vercel** | — | 已释放 `dr` 后可 Pause；正式域 **`dr.mofangdianai.com`** → ECS |

履约站 **无 Serverless**；浏览器 API 一律打到 **轻量**（经 `mofangdianai.com/erp-api` 或新 ECS Nginx 反代过去）。

---

## 步骤总览

| 步骤 | 在哪里做 | 目标 | Vercel |
|------|----------|------|--------|
| **1** | 本机 + Git | 迁移脚本入库，新 ECS 能 `git pull` | 不动 |
| **2** | 新 ECS | 装 Node/Nginx、克隆仓库、`admin` 用户 | 不动 |
| **3** | 本机 / Vercel 控制台 | 导出 `VITE_*` → 新 ECS `.env.production` | 不动 |
| **4** | 域名控制台 | `dr` A 记录 → **ECS** `8.160.173.236` | 已释放 dr |
| **5** | 新 ECS | TLS + `ecs-deploy-talent-fulfillment-web.sh` | — |
| **6** | 浏览器 | 验收 `https://dr.mofangdianai.com` | — |
| **7** | Vercel | Pause 履约项目（可选，稳定后） | 关停 |

下面按步骤展开；**做完一步再进下一步**。

---

## 步骤 1：本机 — 迁移脚本入库

确保新 ECS 能拉到含以下文件的 `main`：

- `scripts/ecs-deploy-talent-fulfillment-web.sh`
- `scripts/ecs-nginx-talent-fulfillment.conf`
- `scripts/ecs-cutover-talent-fulfillment-dns.sh`
- `灵祺达人履约管理后台/.env.production.example`
- 本文档

本机确认后 `git push`（Gitee / GitHub）。  
**完成标志**：新 ECS 上 `git pull` 能看到上述文件。

---

## 步骤 2：新 ECS 基础环境

SSH：`admin@8.160.173.236`

```bash
# 示例：Ubuntu/Debian
sudo apt update
sudo apt install -y git nginx curl

# Node 20 LTS（按你系统选 nvm 或 NodeSource）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2G 内存建议开 swap（构建用）
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile

# 克隆仓库（Gitee 私有库须令牌或 SSH，勿用 su -c 'git clone https://...' 会无法输密码）
# 方式 A（推荐）：Gitee → 设置 → 私人令牌 → 勾选 projects
GITEE_TOKEN=你的令牌 bash /home/admin/app/scripts/ecs-clone-app-once.sh
# 若脚本尚未克隆下来，先交互克隆一次：
#   su - admin
#   git clone https://gitee.com/linqierp/linqierp.git ~/app && cd ~/app && git checkout main

# 方式 B：与轻量相同，复制 admin 的 ~/.ssh 到本机后：
#   git clone git@gitee.com:linqierp/linqierp.git ~/app
```

**完成标志**：`ls /home/admin/app/scripts/ecs-deploy-talent-fulfillment-web.sh` 存在。

> `fatal: could not read Username for 'https://gitee.com'` = 非交互环境无法输入 Gitee 账号，改用上面令牌或 `su - admin` 交互克隆。

**Gitee 密码/令牌都不对时（推荐从轻量拷贝，轻量已有完整 `~/app`）：**

```bash
# 在新 ECS 上（root），把轻量代码同步过来（保留 .git，以后可 pull）
rsync -avz --progress -e ssh admin@139.196.42.5:/home/admin/app/ /home/admin/app/
chown -R admin:admin /home/admin/app
su - admin -c 'cd ~/app && git log -1 --oneline'
```

或只拷贝 SSH 密钥后走 Gitee SSH：

```bash
# 在轻量执行，把私钥显示出来复制到新 ECS /home/admin/.ssh/id_ed25519
# 新 ECS：
mkdir -p /home/admin/.ssh && chmod 700 /home/admin/.ssh
# 粘贴私钥后：
chmod 600 /home/admin/.ssh/id_ed25519
chown -R admin:admin /home/admin/.ssh
su - admin -c 'git clone git@gitee.com:linqierp/linqierp.git ~/app'
```

---

## 步骤 3：环境变量（从 Vercel 抄到 ECS）

Vercel → 履约项目（Root = `灵祺达人履约管理后台`）→ Environment Variables → Production：

| 变量 | 示例 |
|------|------|
| `VITE_MP_API_BASE` | `https://mofangdianai.com/erp-api` |
| `VITE_SUPABASE_URL` | `https://mofangdianai.com` |
| `VITE_SUPABASE_ANON_KEY` | 与商家版相同 |

在新 ECS：

```bash
cp ~/app/灵祺达人履约管理后台/.env.production.example \
   ~/app/灵祺达人履约管理后台/.env.production
nano ~/app/灵祺达人履约管理后台/.env.production
```

**完成标志**：`grep VITE_SUPABASE_ANON_KEY .env.production` 有非空值。

---

## 步骤 4：DNS — `dr.mofangdianai.com` 指向 ECS

Vercel 已释放 `dr` 后，在域名控制台配置：

| 主机记录 | 类型 | 值 |
|----------|------|-----|
| `dr` | A | `8.160.173.236`（**ECS**，不是轻量） |

删除仍指向 Vercel 的旧 CNAME/A（若有）。

证书（在新 ECS，root）：

```bash
cd ~/app && git pull
sudo bash scripts/ecs-setup-ssl-fulfillment-domain.sh dr.mofangdianai.com
```

**完成标志**：`dig +short dr.mofangdianai.com` → `8.160.173.236`。

---

## 步骤 5：新 ECS 部署（API 反代到轻量）

在新 ECS（**默认 API 走轻量公网域名**）：

```bash
cd ~/app && git pull
MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-talent-fulfillment-web.sh
```

说明：

- 静态文件在新 ECS 本机 `灵祺达人履约管理后台/dist`
- `/erp-api/`、`/api/` → 反代 `https://mofangdianai.com`（轻量 Nginx → `meoo-auth-api`）

构建 OOM 时：本机 `npm run build` 后 `scp dist` 到新 ECS，再：

```bash
SKIP_BUILD=1 MEOO_API_UPSTREAM=https://mofangdianai.com bash scripts/ecs-deploy-talent-fulfillment-web.sh
```

**完成标志**：`curl -sI https://dr.mofangdianai.com/ | head -3` 返回 `200`。

---

## 步骤 6：并行验收（Vercel 仍对用户开放）

| 检查项 | `ly-ecs.mofangdianai.com` | Vercel 正式域 |
|--------|---------------------------|---------------|
| 首页 / 登录 | ✓ | ✓ |
| 账号密码登录 | ✓ | ✓ |
| 招募大厅 | ✓ | ✓ |
| 增值服务一页 | ✓ | ✓ |
| Network API 路径 | `.../erp-api/meoo-*`，无 `/erp-api/api/` | 同左 |

```bash
curl -sS https://mofangdianai.com/erp-api/meoo-erp-api-health | head -c 120
```

**完成标志**：两边行为一致；正式用户仍只走 Vercel。

---

## 步骤 7：正式域 DNS 切到 ECS

1. Vercel → 履约项目 → Domains → 记下 Production **正式域** `<正式域>`
2. 域名控制台：`<正式域>` A 记录 → `8.160.173.236`（停用指向 Vercel 的记录）
3. 证书 SAN 含 `<正式域>`（必要时 certbot `--expand`）

**完成标志**：`dig +short <正式域>` → `8.160.173.236`。

---

## 步骤 8：新 ECS 启用正式域 Nginx

```bash
cd ~/app
bash scripts/ecs-cutover-talent-fulfillment-dns.sh <正式域>
```

再测 `https://<正式域>/` 登录与招募大厅。

---

## 步骤 9：关停 Vercel（稳定 24–48h 后）

Vercel → 履约项目 → Settings → **Pause Project**。

日常发版（仅新 ECS）：

```bash
cd ~/app && git pull
FULFILLMENT_PROD_DOMAIN=<正式域> \
MEOO_API_UPSTREAM=https://mofangdianai.com \
bash scripts/ecs-deploy-talent-fulfillment-web.sh
```

---

## 架构示意

```text
用户浏览器
    │
    ├─ 并行期正式域 ──► Vercel（旧，步骤 9 前）
    │
    └─ ly-ecs / 切流后正式域 ──► ECS 8.160.173.236（Nginx → dist）
              │
              ├─ /erp-api/* ──反代──► 轻量 139.196.42.5（mofangdianai.com）
              └─ /api/*     ──反代──► 同上
```

---

## 常见问题

**Q：履约要迁到轻量吗？**  
不迁。轻量只继续跑 API/DB；履约 **Web 只在新 ECS**。

**Q：并行期用户访问哪？**  
仍访问 Vercel 正式域；`ly-ecs` 仅供验收。

**Q：轻量上的 `mofangdianai.com` 商家站要动吗？**  
本迁移不动；只在新 ECS 增加履约子域。
