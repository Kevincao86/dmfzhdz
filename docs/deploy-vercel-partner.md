# 服务商版 · 独立 Vercel 站点（与商家版隔离）

商家版与服务商版是 **两个 Vercel 项目、两个域名**，共用同一仓库与同一套 ECS `/erp-api` 后端；前端通过 `VITE_APP_EDITION` 区分，登录页「切换到商家版/服务商版」为 **跨站跳转**（`VITE_PEER_EDITION_LOGIN_URL`）。

## 不要用的 Root Directory

勿将 Vercel **Root Directory** 设为 `灵祺Web版:服务商版本`（仅 README 占位，无源码、无 package.json）。

## 推荐：Root Directory = `web版/partner-erp`

本目录自带 `vercel.json`：在 `merchant-erp` 执行 `build:partner`，再同步到本目录 `dist/`（满足 Vercel 输出须在 Root 内）。

在 Vercel → **Environment Variables**（Production / Preview 均建议配置）：

| 变量 | 示例 |
|------|------|
| `VITE_APP_EDITION` | `partner` |
| `VITE_PEER_EDITION_LOGIN_URL` | 商家版登录完整 URL，如 `https://cs.mofangdianai.com/login` |
| `VITE_SUPABASE_URL` | 与商家版相同 |
| `VITE_SUPABASE_ANON_KEY` | 与商家版相同 |
| `VITE_ERP_AUTH_API_BASE` | 与商家版相同，如 `https://mofangdianai.com/erp-api` |

## 备选：Root Directory = `web版/merchant-erp`

在 Vercel 项目设置中覆盖（勿用根目录 `vercel.json` 的商家 `npm run build`）：

- **Install Command**: `npm ci`
- **Build Command**: `npm run build:partner`
- **Output Directory**: `dist-partner`
- 环境变量同上。

## 商家版项目（对照）

- **Root Directory**: 仓库根目录，或 `web版/merchant-erp`
- **Build**: `npm run build` → 输出 `dist`
- **`VITE_APP_EDITION`**: 不设置或 `merchant`
- **`VITE_PEER_EDITION_LOGIN_URL`**: 服务商版登录 URL，如 `https://你的服务商域名/login`

## 登录页切换

- 商家站点击「切换到服务商版」→ 打开 `VITE_PEER_EDITION_LOGIN_URL`
- 服务商站点击「切换到商家版」→ 打开 `VITE_PEER_EDITION_LOGIN_URL`

两站 Supabase 会话独立（不同域名），符合「两个网站」隔离要求。
