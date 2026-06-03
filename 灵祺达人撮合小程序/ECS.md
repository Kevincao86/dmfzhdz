# 灵祺达人撮合小程序 · 仅 ECS

## 架构

```
小程序 → https://mofangdianai.com/erp-api → Nginx → meoo-auth-api:3001 → ECS Postgres
```

- **不用** Supabase 云、Vercel、`cs.mofangdianai.com`、`api` 子域
- 小程序网络层仅 3 个文件：`utils/ecs.js`、`utils/api.js`、`utils/auth.js`

## ECS 一次性部署

```bash
cd ~/app && git pull origin main
bash scripts/ecs-mp-minimal.sh
```

## 微信后台

| 项 | 值 |
|----|-----|
| request 合法域名 | `https://mofangdianai.com` |
| downloadFile | `https://mofangdianai.com` |

## 本机上传体验版

1. `utils/mpBuild.js` 与 `config.release.js` 中 `MP_BUILD_ID` = **`mp-20260606-ecs-clean`**
2. 上传体验版 → **删除手机小程序** → 重扫
3. 登录页应显示 `ECS 可达`；仍 -101 时 Safari 打开 `https://mofangdianai.com/erp-api/mp-cronet-ping`

## auth-api.env（登录）

```bash
MP_WECHAT_APPID=...
MP_WECHAT_SECRET=...
MP_AUTH_PEPPER=...
```

改后：`sudo systemctl restart meoo-auth-api`
