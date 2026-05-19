# 墨典达人招募小程序 · GitHub 与 Vercel 部署指南

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
    │
    └─ 墨典达人招募小程序/  ──► 微信开发者工具「上传」──► 微信公众平台审核发布
              │
              └─ utils/config.release.js 或 config.local.js
                    MERCHANT_API_BASE_URL = Vercel 上的 HTTPS 根地址
```

数据存储：Supabase `ops_registry_snapshot`（与商家 Web、运营管控台共用）。

---

## 一、GitHub（代码仓库）

### 1.1 仓库位置

小程序代码已在 monorepo 内：

`墨典达人招募小程序/`

远程仓库示例：`github.com/Kevincao86/dmfzhdz`（`main` 分支）。

### 1.2 日常协作

```bash
git pull origin main
# 修改小程序或 API 后
git add 墨典达人招募小程序/ api/
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
cd 墨典达人招募小程序/utils
cp config.release.example.js config.release.js
# 编辑 MERCHANT_API_BASE_URL 为 Vercel 生产 HTTPS 根地址
```

`config.js` 加载顺序：`config.release.js` → `config.local.js`（本地覆盖）。

**方式 B（仅本机打包）**

```bash
cp config.local.example.js config.local.js
# 填写生产 HTTPS 地址（勿提交）
```

### 3.2 微信公众平台 · 服务器域名

登录 [微信公众平台](https://mp.weixin.qq.com) → 开发 → 开发管理 → 开发设置 → **服务器域名**：

| 类型 | 域名 |
|------|------|
| request 合法域名 | `erp.example.com` 或 `xxx.vercel.app`（与 `MERCHANT_API_BASE_URL` 主机名一致） |

要求：**HTTPS**、已备案（使用国内业务域名时）、证书有效。  
`*.vercel.app` 子域可用于联调；正式运营建议使用自有备案域名。

### 3.3 开发者工具

1. 用微信开发者工具打开目录 **`墨典达人招募小程序/`**。
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
