# 灵祺达人撮合小程序 — ECS 专用部署（不动其它业务）

## 原则

- 数据与 API：**仅** `https://mofangdianai.com/erp-api` → ECS `meoo-auth-api:3001`
- **不用** Supabase 云、Vercel、`cs.mofangdianai.com`、`api` 子域
- 本脚本**不会**重建商家 Web `dist`、不会部署运营台/Vercel

## 一次性重置（ECS admin）

```bash
cd ~/app
git pull origin main
bash scripts/ecs-redeploy-mp-only.sh
```

成功标准：

- `curl https://mofangdianai.com/erp-api/mp-cronet-ping` → `"ok":true`
- `revision` 含 `mp-cronet-ping` 或 `mp-chat-postgrest`

## 微信后台

| 项 | 值 |
|----|-----|
| request 合法域名 | `https://mofangdianai.com` |
| downloadFile 合法域名 | `https://mofangdianai.com` |

## 本机上传体验版

1. 改 `utils/mpBuild.js` → `mp-20260605-ecs-rewrite`（与 `config.release.js` 一致）
2. 微信开发者工具 → 上传体验版
3. **删除**手机小程序 → 重新扫码

## 仍 ERR_CONNECTION_RESET 时

1. 同一台 iPhone **Safari** 打开：`https://mofangdianai.com/erp-api/mp-cronet-ping`
   - Safari 通、微信不通 → `bash scripts/ecs-diagnose-wechat-cronet-reset.sh`（TLS/Cronet）
   - Safari 也不通 → 443/防火墙/证书
2. 勿只依赖「真机调试」；以**体验版**为准
3. 确认 `dig +short AAAA mofangdianai.com` 为空（你已确认 OK）

## 环境变量（仅小程序登录）

在 `~/stack/auth-api.env`：

```bash
MP_WECHAT_APPID=...
MP_WECHAT_SECRET=...
MP_AUTH_PEPPER=...
```

改后：`sudo systemctl restart meoo-auth-api`
