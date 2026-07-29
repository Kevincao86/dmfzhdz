# 墨典官网

宁波墨典网络科技有限公司官方网站（静态单页）。

## 本地预览

```bash
cd 墨典官网
npm run dev
# 浏览器打开 http://127.0.0.1:5177
```

## Vercel 部署（项目名示例：dmfzhdz-mdgw）

**Root Directory 必须选：`墨典官网`**

Build & Development Settings（建议全部关闭 Override，让本目录 `vercel.json` 生效）：

| 项 | 值 |
|---|---|
| Framework Preset | Other |
| Install Command | 关闭 Override（或 `echo skip`） |
| Build Command | 关闭 Override（或 `echo skip`） |
| Output Directory | `.` |

若仍报错 `cd "web版/merchant-erp" && npm ci`：说明 Dashboard 里还留着商家 ERP 的 Override，到  
**Settings → General → Build & Development Settings** 把 Install / Build 的 Override **关掉**，再 Redeploy。

## 结构

- `index.html` — 页面结构与文案
- `assets/css/main.css` — 视觉与响应式
- `assets/js/main.js` — 粒子网格、光标、滚动显现、表单 mailto
- `assets/img/` — 团队出身 / 合作品牌 Logo
