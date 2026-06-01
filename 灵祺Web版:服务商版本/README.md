# 灵祺 Web · 服务商版本（规划目录）

本目录 **不是** 可部署工程，**不要** 在 Vercel 里把 Root Directory 设成 `灵祺Web版:服务商版本`。

## 开发与部署请使用

| 用途 | 路径 |
|------|------|
| 本地开发 | [`web版/partner-erp`](../web版/partner-erp) → `npm run dev` |
| Vercel 独立站点 | Root Directory = **`web版/partner-erp`**（见该目录 `vercel.json`） |
| 源码（与商家共用） | [`web版/merchant-erp`](../web版/merchant-erp) |

部署说明：[`docs/deploy-vercel-partner.md`](../docs/deploy-vercel-partner.md)
