# 灵祺 · 商家微信小程序

与 **Web 版 merchant-erp** 共用 **同一 Supabase 项目**：租户（Auth + `public.tenants`）、业务表与 **Storage 桶策略需一致**，通过 RLS 按 `tenant_id` 隔离。

## 已实现（骨架）

- **登录**：与 Web 一致——**密码登录**（Supabase `grant_type=password`）、**短信验证码登录**、**注册**（经 `MERCHANT_API_BASE_URL` 的 `/api/meoo-auth-*`）；文案不对外提及 Supabase。
- **订阅与会员**：「我的 → 订阅与会员」读取 `tenants.membership_plan`、订阅/赠送天数与到期日，与 Web「设置 → 订阅」一致；升级申报走 `merchant_payment_orders`（`order_kind=subscription`）。
- **在线客服**：「我的 → 在线客服」经 Supabase 表 `support_relay_messages` 与商家管理后台「在线客服」坐席同源会话（与 Web 右下角浮窗同一套云端通道；本地 dev 若启用 WebSocket 代理，Web 可走 ws，小程序走云端表）。
- **同账号平台绑定同步**：登录后 `utils/merchantSessionSyncMp.js` 从 `tenant_merchant_bindings` 拉取与 Web 相同的 **抖音来客 / 巨量本地推 / 小红书聚光** 凭证，写入 `meoo_douyin_merchant_token`、`meoo_local_promotion_bind` 等键；切换 Tab 时会节流刷新。美团 / 小红书商家开放平台 token 目前仅存于 Web 浏览器会话，未上云，小程序暂不能跨设备同步（需在 Web 设置页绑定后，后续可扩展云端存储）。
- **工作台（首页）**：全局浅色 UI；门店状态条、经营数据大卡、**特色功能**（新建商品 / 语音短视频 / GEO 等）、**分页字形图标宫格**、待办与快捷推荐；特色项不出现在宫格内以免重复。  
  - **经营概览**：指标占位页（后续可对接 `merchantDashboardApi` 同源接口）。  
  - **模块说明页**：非语音类入口进入 `module-detail`，说明与 Web 哪一路由同源；复杂表格与图表仍在 Web 完成。  
  - **语音**：达人招募 / 短视频优化 三步流程 + 编辑页（小程序端适配）；**语音商品**入口已合并为「新建商品」统一流程。
- **商品**：「功能 → 新建商品」与 Web `/products/create` 对齐：**选平台 → 确认 →** 抖音走类目/类型/详情（与同 Web wizard 同源接口），美团/小红书等走 `POST …/product/draft` 通用草稿。**商品列表**：平台 Tab、`/api/merchant/*/goods/products` 同源拉取、「刷新列表」与抖音「同步至来客」单条写入。
- **达人招募（与 Web 数据互通）**：配置 **`MERCHANT_API_BASE_URL`** 后，「功能 → 运营」提供与电脑端同名的 **达人招募五步流程入口**、`AI达人Brief` 说明页与 **达人订单** 列表；**表单提交**读写与电脑端一致的 **`/api/ops-sync`** 注册表。达人池筛选、AI 排期、视频审核与结款等仍以电脑端工作台为主；Brief 记录在浏览器本地与同租户桌面端同源查看。
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

### 架构速记：前端在微信，接口在 Vercel

- **小程序包**（你截图里的「灵祺 AI」「功能」「我的」等页面）始终在 **微信公众平台上传提审**，不部署到 Vercel。
- **“后端按钮”**在代码里本质是 `wx.request` / 封装调用：请求发往 **`MERCHANT_API_BASE_URL` + 路径**（例如智能体 **`/api/meoo-ai-chat`**、招募同源 **`/api/ops-sync`** 等）。
- **把整条业务后端放在 Vercel** = 把你的 **merchant-erp 站点根地址**（含这些 `/api/*`）部署到 `https://你的域名`，然后在小程序里让 **`MERCHANT_API_BASE_URL` 指向同一 HTTPS 根地址**。无需改页面结构，只要把配置指对、域名在白名单即可。

复制 `utils/config.local.example.js` 为 **`utils/config.local.js`**（已 gitignore），至少设置：

```js
MERCHANT_API_BASE_URL: 'https://你的项目.vercel.app', // 或使用已备案并绑在 Vercel 的自定义域名，勿尾斜杠
DEV_SKIP_LOGIN: false,                                // 正式/体验版务必关闭跳过登录
// 同时使用与线上一致的云端 Supabase（与 Vercel 里相同）
// SUPABASE_URL: 'https://xxxx.supabase.co',
// SUPABASE_ANON_KEY: 'eyJ...',
```

上线前在 **微信公众平台 → 开发管理 → 开发设置 → 服务器域名**：把上述 **ERP 域名**、**Supabase 域名** 等加入 **`request合法域名`**（仅 https）。开发者工具「不校验合法域名」只对本地调试生效。

AI Key、数据库密钥等只在 **Vercel 环境变量** 与本机 `.env*` 维护；生产环境 **不要** 开启 `MEOO_AI_CHAT_ALLOW_UNAUTHENTICATED`（仅本地跳过登录调试用）。

---

编辑 `utils/config.js`（默认值）与可选的 `config.local.js`：


- **本机模拟器 + 本地 Supabase**：默认 `http://127.0.0.1:54321` + CLI demo anon，与 `web版/merchant-erp/.env.local` 一致。
- **局域网真机预览**：手机访问不了电脑的 `127.0.0.1`。请在 `config.js` 顶部填写 **`LAN_API_HOST`**（电脑在同一 Wi‑Fi 下的 IPv4，如 `192.168.3.10`），或复制 `utils/config.local.example.js` 为 **`config.local.js`** 并设置 `SUPABASE_URL: 'http://该IP:54321'`（此文件已 gitignore）。
- **云端**：在 `config.local.js` 中填写 `https://xxx.supabase.co` 与 Dashboard 的 anon key。
- **`MERCHANT_API_BASE_URL`**：**开发**可为 `http://局域网IP:5173`（须关闭域名校验）；**上架 / 连接 Vercel** 必须为 **HTTPS**，与线上站点根一致（不必再写端口）。须与部署侧 `VITE_MERCHANT_API_BASE_URL`（若有）同源。
- `TENANT_EMAIL_DOMAIN`：须与运营端 / `VITE_SUPABASE_TENANT_EMAIL_DOMAIN` 一致。

在微信开发者工具中导入本目录，修改 `project.config.json` 中的 `appid`。

**开发者工具**：详情 → 本地设置 → 勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**（本地 HTTP 必需）。`project.private.config.json` 中已设置 `urlCheck: false` 便于开发。

确保本机 Docker 已启动 Supabase（项目根 `npm run supabase:start`），且电脑防火墙允许局域网访问 **54321** 端口。

## 域名与白名单

正式上架：在 **request 合法域名** 中列入 **商户 ERP（Vercel）根域名**、`*.supabase.co`（或你实际使用的 Supabase 项目域名）、以及其它会直接请求的 HTTPS 主机。开发阶段可用开发者工具「不校验合法域名」。

## 录音权限

已在 `app.json` 中声明 `scope.record`；首次录音会弹系统授权。
