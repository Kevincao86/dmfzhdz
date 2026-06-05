# 灵祺达人履约管理后台 · Vercel 部署

与商家版/服务商版 **独立 Vercel 项目**，勿用仓库根目录的 `vercel.json`（那是商家 ERP + `/api` 云函数）。

## 必设：Root Directory

Vercel → Project → Settings → General → **Root Directory**：

```text
灵祺达人履约管理后台
```

未设置时会走仓库根 `vercel.json`，约 2s 即失败。

## 构建

本目录 `vercel.json` 已配置：

1. 先 `cd ../web版/merchant-erp && npm ci`（履约站复用商家 `@merchant/*` 页面，TypeScript 需要商家 `node_modules`）
2. 再本目录 `npm ci` + `npm run build` → 输出 `dist/`

## 环境变量（Production / Preview）

| 变量 | 示例 | 说明 |
|------|------|------|
| `VITE_MP_API_BASE` | `https://mofangdianai.com/erp-api` | 小程序/Web 共用 ECS `/erp-api`（**勿**写成 `.../erp-api/api`，勿带末尾 `/`） |
| `VITE_SUPABASE_URL` | 与商家版相同 | 增值服务页（抖音来客等） |
| `VITE_SUPABASE_ANON_KEY` | 与商家版相同 | 同上 |

登录、招募大厅走 `VITE_MP_API_BASE` 下的 `/api/meoo-ops-mp-auth`、`/api/meoo-ops-mp-hall-registry`（由 ECS `meoo-auth-api` 提供，非 Vercel Serverless）。

## 改完变量后

Deployments → 最新失败记录 → **Redeploy**（必须重新构建）。

## 验证码 404 / 页面显示 `not_found`

若浏览器 Network 里请求为 `https://mofangdianai.com/erp-api/api/meoo-auth-sms-send`（多了一层 `api`），说明 **前端仍是旧构建** 或环境变量写错：

1. 确认 `VITE_MP_API_BASE` 仅为 `https://mofangdianai.com/erp-api`
2. 对 `main` 最新提交执行 **Redeploy**（非仅 Promote 旧产物）
3. 硬刷新注册页（Cmd+Shift+R），JS 文件名应变新（非旧的 `index-B8IgZrSA.js` 等）

正确请求示例：`https://mofangdianai.com/erp-api/meoo-auth-sms-send`

## 本地对照

```bash
cd 灵祺达人履约管理后台
cd ../web版/merchant-erp && npm ci && cd -
npm ci && npm run build
```
