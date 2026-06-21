# 灵祺达人撮合小程序 · 仅 ECS

> **域名备案已暂停解析？** 先按 **[备案期启动-绕过域名.md](./备案期启动-绕过域名.md)** 用云函数 + 轻量 IP 跑通；备案通过后见文末恢复直连。

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

## 仍 ERR_CONNECTION_RESET（-101）

登录页 **「HTTPS 握手失败」** = TLS 层被断开，**不是**登录接口或小程序业务代码。

1. **同手机 Safari** 打开 `https://mofangdianai.com/erp-api/mp-cronet-ping`  
   - 有 JSON、微信仍失败 → 常见 **阿里云未「接入备案」**（仅在其他平台备案不够）  
   - Safari 也不行 → 执行 `bash scripts/ecs-mp-minimal.sh`

2. ECS：`bash scripts/ecs-check-aliyun-beian-wechat.sh`  
   到 [beian.aliyun.com](https://beian.aliyun.com/) 为 `mofangdianai.com` 做 **新增接入备案**（与 ECS 同账号）。

3. **备案过渡期**：使用 **[备案过渡-云开发代理.md](./备案过渡-云开发代理.md)**（推荐，无需等备案）。

## 备案通过后（mofangdian.com）

1. DNS：`mofangdian.com` → ECS 公网 IP  
2. `sudo bash scripts/ecs-mp-add-domain.sh mofangdian.com`  
3. `config.release.js` 改为 `config.release.after-beian.example.js` 内容（`MP_USE_CLOUD_PROXY: false`）  
4. 微信合法域名：`https://mofangdian.com`
