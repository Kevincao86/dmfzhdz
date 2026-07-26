# 灵祺 · 区域服务商（城市代理门户）

域名：**https://adqf.mofangdianai.com**

账号开通、城市范围、模块权限、分成比例一律在运营管控台（`admin.mofangdianai.com` → 区域服务商）配置。

## 本地开发

```bash
cd 区域服务商
cp .env.example .env
npm ci
npm run dev
```

默认 `http://127.0.0.1:5180`，API 走 `VITE_ERP_AUTH_API_BASE`（生产为 `https://mofangdianai.com/erp-api`）。

## Vercel 部署（GitHub 同仓）

1. 在 Vercel 新建 Project，连接本仓库（GitHub）
2. **Root Directory** = `区域服务商`
3. 环境变量：`VITE_ERP_AUTH_API_BASE=https://mofangdianai.com/erp-api`
4. 域名：`adqf.mofangdianai.com` → CNAME 到 Vercel

业务写库 API **不**部署在 Vercel，统一走轻量 `meoo-auth-api`。
