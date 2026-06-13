# 小程序封面图库 · OSS 模式

备案期手机无法直连 `mofangdianai.com`，本地分包在上传体验版时也不稳定。**小程序图库改走阿里云 OSS 公网 HTTPS URL**。

## 一次性上传（ECS 或本机）

### 方式 A：你已经在 ECS 终端里（左图那种 `admin@iZuf...`）

**不要**再 `ssh admin@139.196.42.5`（会要密码且多余）。在当前 ECS 窗口直接执行：

```bash
cd ~/app
bash scripts/ecs-git-pull-gitee.sh
bash scripts/ecs-upload-mp-recruit-covers-oss.sh
```

若报 **未找到 OSS AccessKey**，在 ECS 编辑 `~/stack/auth-api.env`，追加（与云剪/商品图同一套 AK 即可）：

```bash
OSS_ACCESS_KEY_ID=你的AccessKeyId
OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
OSS_BUCKET=modianningbo
OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
```

保存后重新执行 `bash scripts/ecs-upload-mp-recruit-covers-oss.sh`（**无需** restart auth-api）。

若 `~/app` 不存在，先 `pwd` 找到仓库目录（常见还有 `~/dmfzhdz`），再 `cd` 进去执行 `bash scripts/ecs-upload-mp-recruit-covers-oss.sh`。

### 方式 B：本机 Mac

必须先进入项目目录（否则会报 `Cannot find module .../Users/damowang/scripts/...`）：

```bash
cd "/Volumes/大魔王的OS - Data/Users/damowangOS/灵祺AI智能ERP_迁移/灵祺/项目"
bash scripts/upload-mp-recruit-covers-oss-local.sh
```

本机需在 `web版/merchant-erp/.env.local` 或 `.env.production` 配好 OSS AccessKey；**本机没配 AK 时请用方式 A 在 ECS 上跑**。

### 方式 C：从 Mac SSH 到 ECS（需已配置免密公钥）

```bash
ssh admin@139.196.42.5 'cd ~/app && git pull && bash scripts/ecs-upload-mp-recruit-covers-oss.sh'
```

若报 `Permission denied (publickey,password)`，说明 Mac 未配置 ECS 公钥，请用 **方式 A**（浏览器/Workbench 登录 ECS 后直接跑）。

上传后写入 `utils/recruitCoverOssBase.js`，默认前缀：

`https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers`

## 微信后台

**开发 → 开发管理 → 服务器域名 → downloadFile 合法域名** 添加：

`https://modianningbo.oss-cn-shanghai.aliyuncs.com`

（若 Bucket 不同，以 `recruitCoverOssBase.js` 中的域名为准）

## 小程序

- 封面图走 OSS，**不上传** `packages/recruit-covers-mp/`（已在 `project.config.json` packOptions.ignore）
- 分享海报头图 / QR 框走 OSS，**不上传** `assets/recruit-poster-bg/`（同上 ignore；上传见 `bash scripts/upload-mp-recruit-poster-bg-oss.js`）
- 首页 Banner 人物/云朵走 OSS `home/`（`homeBannerAssets.js`），**不上传** `images/home/**`
- 构建号：`mp-20260613-oss-slim-cover-fill`
- 封面 JPEG 统一 **500×400 cover 裁剪**（分享 5:4 铺满，无上下黑边）
- 清除缓存 → 重新编译 → **上传体验版**（主包应 < 2MB）

## OSS 目录公共读

请在 OSS 控制台为 `mp-recruit-covers/*` 配置 Bucket 策略允许匿名 `GetObject`（与商品图公共读前缀相同做法）。
