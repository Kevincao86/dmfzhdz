# 灵祺达人招募小程序 · GitHub 与 Vercel 部署指南

> **说明**：微信小程序本体**不会**部署到 Vercel；Vercel 部署的是**商家 ERP 后端 API**。小程序通过微信开发者工具上传至微信公众平台。本指南说明二者如何串联。

---

## 架构一览

```text
GitHub (dmfzhdz  monorepo)
    │
    ├─ push main ──► Vercel Project（仓库根 vercel.json）
    │                    ├─ 静态：web版/merchant-erp/dist
    │                    └─ Serverless API：
    │                         GET  /api/meoo-ops-sync-registry
    │                         POST /api/meoo-ops-mp-recruitment-orders-apply
    │                         POST /api/meoo-ops-mp-talent-member-register
    │                         POST /api/meoo-mp-recruitment-ai（商单 AI 标签 / 达人匹配）
    │
    └─ 灵祺达人招募小程序/  ──► 微信开发者工具「上传」──► 微信公众平台审核发布
              │
              └─ utils/config.release.js 或 config.local.js
                    MERCHANT_API_BASE_URL = Vercel 上的 HTTPS 根地址
```

数据存储：Supabase `ops_registry_snapshot`（与商家 Web、运营管控台共用）。

---

## 一、GitHub（代码仓库）

### 1.1 仓库位置

小程序代码已在 monorepo 内：

`灵祺达人招募小程序/`

远程仓库示例：`github.com/Kevincao86/dmfzhdz`（`main` 分支）。

### 1.2 日常协作

```bash
git pull origin main
# 修改小程序或 API 后
git add 灵祺达人招募小程序/ api/
git commit -m "feat(mp): …"
git push origin main
```

推送 `main` 后，若 Vercel 已绑定该仓库，**商家 ERP + API 会自动重新部署**；小程序需单独在微信工具里上传。

### 1.3 不要提交的文件

| 文件 | 说明 |
|------|------|
| `utils/config.local.js` | 本地开发地址，已在 `.gitignore` |
| 真实密钥 | 密钥只放在 Vercel / Supabase 环境变量 |

可选：将生产 API 地址写入 **`utils/config.release.js`**（可从 `config.release.example.js` 复制）并提交，便于团队统一生产配置。

---

## 二、Vercel（商家 ERP + 小程序 API）

### 2.1 项目设置

在 [Vercel Dashboard](https://vercel.com) 导入 GitHub 仓库时建议：

| 项 | 值 |
|----|-----|
| **Root Directory** | `.`（仓库根，使用根目录 `vercel.json`） |
| **Framework Preset** | Other |
| **Build Command** | （由 `vercel.json` 指定）`cd "web版/merchant-erp" && npm run build` |
| **Output Directory** | `web版/merchant-erp/dist` |

根目录 `vercel.json` 已配置 `api/meoo-ops-*` 与静态站；**请勿**把 Root Directory 只设为 `web版/merchant-erp`，否则根 `api/` 薄封装不会生效，小程序接口会 404。

### 2.2 环境变量（生产必填）

在 Vercel → Project → **Settings → Environment Variables**（Production / Preview 按需）：

| 变量 | 用途 |
|------|------|
| `SUPABASE_URL` 或 `VITE_SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 读写 `ops_registry_snapshot`（**仅服务端**，勿暴露到小程序） |

与商家 Web、运营台共用同一 Supabase 项目即可。

其他变量（抖音、AI 等）为商家 ERP 功能所用；**仅跑招募大厅**时上述两项是小程序相关 API 的最低要求。

**商单 AI 标签 / 推荐匹配**（首页三大厅、推荐商单）需额外配置其一：

| 变量 | 用途 |
|------|------|
| `MERCHANT_AI_DOUBAO_KEY` 或 `ARK_API_KEY` | 豆包（优先） |
| `MERCHANT_AI_QWEN_KEY` 或 `DASHSCOPE_API_KEY` | 通义千问（备选） |
| `MERCHANT_MP_AI_PROVIDER`（可选） | `doubao` 或 `qwen`，指定优先厂商 |

未配置时列表仍展示，但使用本地规则标签（如「急单速报」「同城优选」），推荐页不按 AI 匹配度排序。

### 2.3 部署后自检

将 `https://<你的-vercel-域名>` 记为 **`MERCHANT_API_BASE_URL`**（无末尾 `/`）。

在浏览器或 curl 验证：

```bash
# 应返回 JSON（含 mpRecruitmentOrders 等字段或空数组）
curl -sS "https://<域名>/api/meoo-ops-sync-registry" | head -c 500

# 报名接口存在（POST 无 body 可能 400，但不应 404）
curl -sS -o /dev/null -w "%{http_code}" -X POST \
  "https://<域名>/api/meoo-ops-mp-recruitment-orders-apply" \
  -H "Content-Type: application/json" -d '{}'
```

期望：registry **200**；apply **非 404**（如 400/500 说明路由已通，再查 Supabase 配置）。

### 2.4 自定义域名（推荐）

1. Vercel → Domains 绑定如 `erp.example.com`（需 **ICP 备案** 若服务器在境内且面向国内用户）。
2. 小程序与 `config.release.js` 中的 `MERCHANT_API_BASE_URL` 改为该 **HTTPS** 域名。

---

## 三、小程序连接生产 API

### 3.1 配置 API 地址

**方式 A（推荐团队统一）**

```bash
cd 灵祺达人招募小程序/utils
cp config.release.example.js config.release.js
# 编辑 MERCHANT_API_BASE_URL 为 Vercel 生产 HTTPS 根地址
```

`config.js` 加载顺序：`config.release.js` → `config.local.js`（本地覆盖）。

**方式 B（仅本机打包）**

```bash
cp config.local.example.js config.local.js
# 填写生产 HTTPS 地址（勿提交）
```

### 3.2 微信公众平台 · 服务器域名（迁 ECS 后必改）

登录 [微信公众平台](https://mp.weixin.qq.com) → 开发 → 开发管理 → 开发设置 → **服务器域名**。

**须与 `config.release.js` 里实际请求的 HTTPS 主机名完全一致**（`www` 与不带 `www` 算两个域名，都要单独添加）。

#### 推荐（阿里云 ECS + 根域 Supabase 反代）

| 类型 | 建议域名 |
|------|----------|
| request 合法域名 | `https://mofangdianai.com` |
| uploadFile / downloadFile | **必须**同上 `https://mofangdianai.com`（招募大厅 GET 在 `wx.request` reset 时会走 `downloadFile` 备用通道） |
| DNS 预解析 | `mofangdianai.com` |

`MERCHANT_API_BASE_URL` 填 **`https://mofangdianai.com/erp-api`**（小程序会自动把 `/api/xxx` 拼成 `/erp-api/xxx`）。

若私信/客服走直连 Supabase（配置了 `SUPABASE_URL`），request 域名必须是 **`https://mofangdianai.com`**（走 `/rest/v1/`），不要只填云端 `*.supabase.co`，除非仍用旧配置。

#### ECS 服务器上（SSH 一次性 / 发版后）

在阿里云 ECS（仓库一般在 `~/app`）：

```bash
cd ~/app
bash scripts/ecs-git-pull-main.sh    # 或 git pull --ff-only
bash scripts/ecs-fix-erp-api-502.sh  # 拉代码、重启 meoo-auth-api、探活
```

### 3.2.1 体验版仍 `ERR_CONNECTION_RESET`（-101）

这与微信合法域名、重新上传**无关**，是 **`https://mofangdianai.com` 公网 443/TLS** 问题（商家 Web 在 `cs.mofangdianai.com`，可以正常而小程序仍失败）。

**手机 Safari** 打开：

```text
https://mofangdianai.com/erp-api/meoo-ops-sync-registry
```

- 打不开 / 一直转圈 → 在 ECS 执行（**只修 Nginx/证书，不动商家 Vercel**）：

```bash
cd ~/app && git pull
sudo bash scripts/ecs-fix-wechat-https-443.sh
```

- 能打开大段 JSON → 再删除小程序、重扫**最新体验版**二维码。

确认：

```bash
curl -sS https://mofangdianai.com/erp-api/meoo-erp-api-health
# revision 应为 20260601-mp-routes（或更新），routes 数量明显增加

curl -sS "https://mofangdianai.com/erp-api/meoo-ops-sync-registry" | head -c 300
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://mofangdianai.com/erp-api/meoo-ops-mp-recruitment-orders-apply" \
  -H "Content-Type: application/json" -d '{}'
# 报名：非 404（400/503 表示路由已通）
```

**商单 AI 标签**（可选）：在 `~/stack/auth-api.env` 追加与 Vercel 相同的 `MERCHANT_AI_DOUBAO_KEY` / `MERCHANT_AI_QWEN_KEY` 等，然后 `sudo systemctl restart meoo-auth-api`。

Nginx 需已有 `/erp-api/` → `127.0.0.1:3001`（见仓库 `scripts/ecs-meoo-api.nginx.conf`）；AI 流式对话另需 `proxy_buffering off`（发版说明见 merchant-erp 部署文档）。

#### 过渡期（部分接口仍在 Vercel）

若 ECS `meoo-erp-api-health` 的 `revision` **不含** `mp-routes`，或报名接口公网返回 **404**，须暂时保留 Vercel 合法域名：`https://dmfweb.vercel.app`。

ECS 已拉取含 `20260601-mp-routes` 的代码并执行 `bash scripts/ecs-fix-erp-api-502.sh` 通过后，微信后台可只保留 `mofangdianai.com`。

#### 注意

- 你截图里的 `https://www.mofangdianai.com` **不能替代** `https://mofangdianai.com`；若 API 用根域，请**新增** `mofangdianai.com`（或统一全站用 www 并改 Nginx/证书）。
- 要求：**HTTPS**、备案域名、证书有效。

### 3.3 开发者工具

1. 用微信开发者工具打开目录 **`灵祺达人招募小程序/`**。
2. 确认 `project.config.json` 中 **`appid`** 为正式小程序 AppID。
3. **开发阶段**：可勾选「不校验合法域名」；**上传体验版/正式版前**必须配置合法域名并关闭仅靠跳过的方式。
4. 菜单 **上传** → 在微信公众平台选为体验版 / 提交审核。

### 3.4 与运营后台联调

1. 运营在 **商家管理后台** 或 **商家 ERP** 创建「小程序招募」订单，获得分享路径：  
   `pages/detail/detail?id=MP-RO-xxxxx`
2. 达人端首页「招募大厅 / 急单大厅」数据来自 `GET /api/meoo-ops-sync-registry`。
3. 报名、会员注册分别走 apply / register 接口，写入同一注册表。

---

## 四、可选：运营后台单独部署

若希望小程序只访问 **运营管控台** 域名（而非商家 ERP），可将 `MERCHANT_API_BASE_URL` 指向运营台 Vercel 项目根地址；需该项目的 `api/meoo-ops-sync-registry` 等路由已部署且 Supabase 环境变量一致。

本仓库默认推荐：**与商家 ERP 共用根目录 Vercel 部署**，路径以 `meoo-ops-*` 为准（见 `utils/opsRegistryTalentMp.js` 回退逻辑）。

---

## 五、发布检查清单

- [ ] GitHub `main` 已推送，Vercel 最近一次部署 **Ready**
- [ ] Vercel 已配置 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `curl` 自检 registry / apply 非 404
- [ ] `config.release.js` 或本地 `config.local.js` 已填生产 `MERCHANT_API_BASE_URL`
- [ ] 微信公众平台 **request 合法域名** 已添加
- [ ] `project.config.json` **appid** 为正式号
- [ ] 微信开发者工具已上传代码并提交审核（或发布体验版先验收）

---

## 六、常见问题

**Q：小程序提示「尚未配置后台地址」**  
A：未创建 `config.release.js` / `config.local.js`，或 `MERCHANT_API_BASE_URL` 为空。

**Q：招募大厅空白 / 拉取失败**  
A：检查 registry 接口 200、Supabase 中是否有 `mpRecruitmentOrders`；运营是否已创建小程序招募单。

**Q：报名失败 404**  
A：确认 Vercel 使用**仓库根**部署且 `api/meoo-ops-mp-recruitment-orders-apply.ts` 已存在于仓库根 `api/`（本仓库已提供薄封装）。

**Q：Git push 后小程序会自动更新吗？**  
A：**不会**。仅 API（Vercel）自动更新；小程序须在开发者工具中重新上传。

---

## 相关文件

| 路径 | 说明 |
|------|------|
| `/vercel.json` | 根部署与 API 函数配置 |
| `/api/meoo-ops-*.ts` | 根 API 转发至 `web版/merchant-erp/api` |
| `utils/config.js` | 合并 release / local 配置 |
| `utils/opsRegistryTalentMp.js` | 小程序调用的 API 路径 |
| `web版/merchant-erp/.env.example` | 商家 ERP 全量环境变量说明 |
