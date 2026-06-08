# 小程序封面图库 · OSS 模式

备案期手机无法直连 `mofangdianai.com`，本地分包在上传体验版时也不稳定。**小程序图库改走阿里云 OSS 公网 HTTPS URL**。

## 一次性上传（ECS 或本机）

```bash
# 本机（需 web版/merchant-erp/.env.local 或 .env.merchant 配好 OSS AK）
node scripts/upload-mp-recruit-covers-oss.js

# 或 ECS（推荐，AK 已在 auth-api.env / .env.production）
ssh admin@139.196.42.5 'cd ~/app && bash scripts/ecs-upload-mp-recruit-covers-oss.sh'
```

上传后写入 `utils/recruitCoverOssBase.js`，默认前缀：

`https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers`

## 微信后台

**开发 → 开发管理 → 服务器域名 → downloadFile 合法域名** 添加：

`https://modianningbo.oss-cn-shanghai.aliyuncs.com`

（若 Bucket 不同，以 `recruitCoverOssBase.js` 中的域名为准）

## 小程序

- `MP_COVER_USE_BUNDLE: false`（不再依赖分包 JPEG）
- 构建号：`mp-20260609-cover-oss`
- 清除缓存 → 重新编译 → **上传体验版**

## OSS 目录公共读

请在 OSS 控制台为 `mp-recruit-covers/*` 配置 Bucket 策略允许匿名 `GetObject`（与商品图公共读前缀相同做法）。
