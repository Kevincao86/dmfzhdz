# 灵祺独立在线客服台

与运营台 `/support` 共用 `support_relay_messages`；坐席也可在飞书回复机器人卡片。

## 本地

```bash
cd 在线客服
npm ci
npm run dev   # http://127.0.0.1:5182
```

登录 Token = 轻量 `MEOO_SUPPORT_OPS_HTTP_TOKEN`（可写入 `VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN` 免输入）。

## 飞书双向（轻量）

在 `~/stack/auth-api.env` 配置：

```bash
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_ENCRYPT_KEY=
FEISHU_VERIFICATION_TOKEN=
FEISHU_SUPPORT_RECEIVE_ID=     # 客服群 chat_id
FEISHU_SUPPORT_RECEIVE_ID_TYPE=chat_id
```

事件订阅 URL：

`https://mofangdianai.com/erp-api/meoo-support-feishu-callback`

订阅事件：`im.message.receive_v1`；权限：`im:message`、`im:message:send_as_bot` 等。

无应用凭证时自动降级为原有群 Webhook 仅通知。

## 部署前端（可选 · 新ECS / Vercel）

本机构建后将 `dist` 挂到独立子域（如 `kf.mofangdianai.com`），API 仍走轻量 `/erp-api`。
