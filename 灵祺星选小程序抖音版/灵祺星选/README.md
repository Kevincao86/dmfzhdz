# 灵祺星选 · 抖音小程序

与 **微信版**（`灵祺达人撮合小程序`）页面、功能、数据面一致；API 统一走轻量 `https://mofangdianai.com/erp-api`。

## 与微信版的差异（仅抖音目录内）

| 项 | 抖音版 |
|----|--------|
| 登录 | `tt.login` → 轻量 `dy_login` |
| 网络 | `MP_USE_CLOUD_PROXY: false`，直连 erp-api（无微信云开发） |
| 运行时 | `utils/wxAdapter.js` 将 `tt` 挂载为 `wx` |
| AppID | `tt9f05e9b8016199c301`（见 `project.config.json`） |

## 同步微信版代码

```bash
bash scripts/sync-wechat-mp-to-douyin.sh
# 然后重新应用本目录 utils/config.release.js、utils/wxAdapter.js、project.config.json
```

## 轻量环境变量（抖音登录）

在轻量 `meoo-auth-api` 环境配置：

- `MP_DOUYIN_APPID`（默认已写 `tt9f05e9b8016199c301`）
- `MP_DOUYIN_SECRET`（抖音开放平台 AppSecret）

开发模式：`MP_AUTH_DEV_MODE=true` 时可用 `dydev_` 固定 openid。

## 抖音开放平台

须配置 request 合法域名：`https://mofangdianai.com`
