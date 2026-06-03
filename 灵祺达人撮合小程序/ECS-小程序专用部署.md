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

- ECS 上 `bash scripts/ecs-fix-mp-443-handshake-definitive.sh` 通过（Node 探活 `mp-cronet-ping` → `"ok":true`）
- `revision` 含 `20260606-tls13-post`

## 微信后台

| 项 | 值 |
|----|-----|
| request 合法域名 | `https://mofangdianai.com` |
| downloadFile 合法域名 | `https://mofangdianai.com` |

## 本机上传体验版

1. 确认 `utils/config.release.js` 中 `MP_BUILD_ID=mp-20260606-tls13-post`
2. 微信开发者工具 → 上传体验版
3. **删除**手机小程序 → 重新扫码

## 仍 ERR_CONNECTION_RESET 时

1. 同一台 iPhone **Safari** 打开：`https://mofangdianai.com/erp-api/mp-cronet-ping`
   - Safari 通、微信不通 → 先 `bash scripts/ecs-fix-mp-443-handshake-definitive.sh`（须 TLS1.2+1.3，勿仅 1.2）
   - Safari 也不通 → 443/防火墙/证书/阿里云备案
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
