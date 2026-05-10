# 店魔方 · 商家微信小程序

与 **Web 版 merchant-erp** 共用 **同一 Supabase 项目**：租户（Auth + `public.tenants`）、业务表与 **Storage 桶策略需一致**，通过 RLS 按 `tenant_id` 隔离。

## 已实现（骨架）

- **登录**：仅账户名 + 密码（与 Web 相同的邮箱推导规则），调用 Supabase `auth/v1/token?grant_type=password`。
- **工作台（首页）**：全局浅色 UI；门店状态条、经营数据大卡、**特色功能**（语音商品 / 语音达人招募 / 语音短视频 / GEO）、**分页字形图标宫格**、待办与快捷推荐；特色项不出现在宫格内以免重复。  
  - **经营概览**：指标占位页（后续可对接 `merchantDashboardApi` 同源接口）。  
  - **模块说明页**：非语音类入口进入 `module-detail`，说明与 Web 哪一路由同源；复杂表格与图表仍在 Web 完成。  
  - **语音**：商品 / 达人招募 / 短视频优化 三步流程 + 编辑页分区样式（小程序端 UI 适配）。
- **达人招募（与 Web 数据互通）**：配置 **`MERCHANT_API_BASE_URL`**（与 Web `VITE_MERCHANT_API_BASE_URL` 相同，指向 merchant-erp 服务根地址，如 `http://局域网IP:5173`）后，小程序 **招募列表**、**表单/语音编辑提交** 将读写与电脑端相同的 **`/api/ops-sync`** 注册表；订单会在 Web「达人招募」与运营管控台同源列表中出现。
- **各板块**：其余模块仍可按同一思路接入 ERP 网关或 Supabase；语音链路仍为 录制 → AI 草稿 → 编辑页。

菜单配置：`utils/menu.js`；模块文案：`utils/mpModules.js`。

## 语音 → AI → 编辑页（对接说明）

1. **推荐**：部署 Supabase Edge Function（或自建网关），接收小程序 `wx.uploadFile` 上传的音频：
   - ASR（微信插件 / 火山 / 阿里云等）→ 文本；
   - 再调用你们的 **分类/品类分类器 + 字段抽取模型**（或与 ERP 已有 AI 管线一致）；
   - 返回 JSON：`{ categoryId, productType, title, fields: {...}, rawText }`。
2. 将函数 URL 填入 `utils/config.js` 的 `VOICE_DRAFT_URL`（及按需增加 header，例如 `Authorization: Bearer <access_token>`）。
3. 若留空 `VOICE_DRAFT_URL`，当前使用 **本地模拟草稿**（便于界面联调）。

## 配置

编辑 `utils/config.js`：

- **本机模拟器 + 本地 Supabase**：默认 `http://127.0.0.1:54321` + CLI demo anon，与 `web版/merchant-erp/.env.local` 一致。
- **局域网真机预览**：手机访问不了电脑的 `127.0.0.1`。请在 `config.js` 顶部填写 **`LAN_API_HOST`**（电脑在同一 Wi‑Fi 下的 IPv4，如 `192.168.3.10`），或复制 `utils/config.local.example.js` 为 **`config.local.js`** 并设置 `SUPABASE_URL: 'http://该IP:54321'`（此文件已 gitignore）。
- **云端**：在 `config.local.js` 中填写 `https://xxx.supabase.co` 与 Dashboard 的 anon key。
- **`MERCHANT_API_BASE_URL`**：填写 Web ERP（merchant-erp）可访问的根 URL（开发示例 `http://192.168.x.x:5173`），用于招募单等与 Web 共用的 HTTP 网关；须与电脑 `.env` 中 `VITE_MERCHANT_API_BASE_URL` 一致，且开发阶段需在开发者工具中关闭域名校验。
- `TENANT_EMAIL_DOMAIN`：须与运营端 / `VITE_SUPABASE_TENANT_EMAIL_DOMAIN` 一致。

在微信开发者工具中导入本目录，修改 `project.config.json` 中的 `appid`。

**开发者工具**：详情 → 本地设置 → 勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**（本地 HTTP 必需）。`project.private.config.json` 中已设置 `urlCheck: false` 便于开发。

确保本机 Docker 已启动 Supabase（项目根 `npm run supabase:start`），且电脑防火墙允许局域网访问 **54321** 端口。

## 域名与白名单

正式上架：小程序 request 合法域名需配置 **HTTPS** 的 Supabase（或自建网关）。开发阶段可用上述「不校验合法域名」。

## 录音权限

已在 `app.json` 中声明 `scope.record`；首次录音会弹系统授权。
