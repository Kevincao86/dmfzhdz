#!/usr/bin/env bash
# 将灵祺达人撮合小程序（微信）同步到灵祺星选抖音版（仅覆盖抖音目录，不改微信源）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/灵祺达人撮合小程序"
DEST="$ROOT/灵祺星选小程序抖音版/灵祺星选"
DY_APPID="tt9f05e9b8016199c301"

if [[ ! -d "$SRC" ]]; then
  echo "缺少微信源: $SRC" >&2
  exit 1
fi
mkdir -p "$DEST"

# 备份抖音专属配置
TMP="$(mktemp -d)"
cp -f "$DEST/utils/config.release.js" "$TMP/config.release.js" 2>/dev/null || true
cp -f "$DEST/utils/wxAdapter.js" "$TMP/wxAdapter.js" 2>/dev/null || true
cp -f "$DEST/utils/mpPlatformUi.js" "$TMP/mpPlatformUi.js" 2>/dev/null || true
cp -f "$DEST/utils/mpLoginCopy.js" "$TMP/mpLoginCopy.js" 2>/dev/null || true
cp -f "$DEST/styles/mp-douyin-theme.wxss" "$TMP/mp-douyin-theme.wxss" 2>/dev/null || true
cp -f "$DEST/project.config.json" "$TMP/project.config.json" 2>/dev/null || true
cp -f "$DEST/README.md" "$TMP/README.md" 2>/dev/null || true

rsync -a --delete \
  --exclude 'utils/config.local.js' \
  --exclude 'project.private.config.json' \
  --exclude 'cloudfunctions/**' \
  --exclude '.git' \
  --exclude 'node_modules' \
  "$SRC/" "$DEST/"

# 恢复 / 写入抖音专属
if [[ -f "$TMP/config.release.js" ]]; then cp -f "$TMP/config.release.js" "$DEST/utils/config.release.js"
else cp -f "$ROOT/灵祺星选小程序抖音版/灵祺星选/utils/config.release.js" "$DEST/utils/" 2>/dev/null || true
fi
if [[ -f "$TMP/wxAdapter.js" ]]; then cp -f "$TMP/wxAdapter.js" "$DEST/utils/wxAdapter.js"
fi
if [[ -f "$TMP/mpPlatformUi.js" ]]; then cp -f "$TMP/mpPlatformUi.js" "$DEST/utils/mpPlatformUi.js"
fi
if [[ -f "$TMP/mpLoginCopy.js" ]]; then cp -f "$TMP/mpLoginCopy.js" "$DEST/utils/mpLoginCopy.js"
fi
if [[ -f "$TMP/mpDouyinAuthUi.js" ]]; then cp -f "$TMP/mpDouyinAuthUi.js" "$DEST/utils/mpDouyinAuthUi.js"
fi
if [[ -f "$TMP/mp-douyin-theme.wxss" ]]; then cp -f "$TMP/mp-douyin-theme.wxss" "$DEST/styles/mp-douyin-theme.wxss"
fi
if [[ -f "$TMP/README.md" ]]; then cp -f "$TMP/README.md" "$DEST/README.md"
fi

# 抖音 project.config
cat > "$DEST/project.config.json" <<EOF
{
    "setting": {
        "urlCheck": true,
        "es6": true,
        "postcss": true,
        "minified": true,
        "newFeature": true,
        "autoCompile": true,
        "compileHotReLoad": true,
        "nativeCompile": true
    },
    "appid": "$DY_APPID",
    "projectname": "灵祺星选",
    "douyinProjectType": "native",
    "miniprogramRoot": "./",
    "compileType": "miniprogram"
}
EOF

# app.js 首行 wxAdapter
if ! head -1 "$DEST/app.js" | grep -q wxAdapter; then
  { echo "require('./utils/wxAdapter.js')"; cat "$DEST/app.js"; } > "$DEST/app.js.tmp"
  mv "$DEST/app.js.tmp" "$DEST/app.js"
fi

# auth.js dy_login + config require
if ! grep -q "MP_PLATFORM === 'douyin'" "$DEST/utils/auth.js"; then
  sed -i '' "s/authPost('wx_login'/authPost(config.MP_PLATFORM === 'douyin' ? 'dy_login' : 'wx_login'/" "$DEST/utils/auth.js" 2>/dev/null || \
  sed -i "s/authPost('wx_login'/authPost(config.MP_PLATFORM === 'douyin' ? 'dy_login' : 'wx_login'/" "$DEST/utils/auth.js"
fi
if ! grep -q "require('./config.js')" "$DEST/utils/auth.js"; then
  sed -i '' "s/const ecs = require/const config = require('./config.js')\nconst ecs = require/" "$DEST/utils/auth.js" 2>/dev/null || \
  sed -i "s/const ecs = require/const config = require('./config.js')\nconst ecs = require/" "$DEST/utils/auth.js"
fi

# app.json 去掉微信跳小程序白名单
node -e "
const fs=require('fs');
const p='$DEST/app.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
delete j.navigateToMiniProgramAppIdList;
if (j.permission) delete j.permission['scope.writePhotosAlbum'];
if (j.tabBar) {
  j.tabBar.custom = true;
  j.tabBar.borderStyle = 'black';
}
fs.writeFileSync(p, JSON.stringify(j, null, 2));
"

# 抖音使用系统导航栏，去掉 tab 页 custom navigationStyle
node -e "
const fs=require('fs');
const path=require('path');
const dest='$DEST';
const pages=[
  'pages/index/index.json',
  'pages/index/index.json',
  'pages/recommend/recommend.json',
  'pages/messages/messages.json',
  'pages/mine/mine.json',
  'pages/publish/publish.json',
  'pages/login/login.json',
  'pages/welcome/welcome.json',
];
for (const rel of pages) {
  const fp=path.join(dest, rel);
  if (!fs.existsSync(fp)) continue;
  const j=JSON.parse(fs.readFileSync(fp,'utf8'));
  delete j.navigationStyle;
  if (rel === 'pages/login/login.json') {
    j.navigationBarTitleText = '登录';
    j.navigationBarBackgroundColor = '#0284c7';
    j.navigationBarTextStyle = 'white';
  }
  if (rel === 'pages/welcome/welcome.json') {
    j.navigationBarTitleText = '灵祺星选';
    j.navigationBarBackgroundColor = '#9b87f5';
    j.navigationBarTextStyle = 'white';
  }
  if (rel === 'pages/index/index.json') {
    j.navigationBarBackgroundColor = '#0284c7';
    j.navigationBarTextStyle = 'white';
  }
  fs.writeFileSync(fp, JSON.stringify(j, null, 2) + '\n');
}
"
"

rm -rf "$DEST/cloudfunctions" "$DEST/java-springboot-demo" 2>/dev/null || true
rm -rf "$TMP"
echo "OK: synced -> $DEST (抖音 overlay 已保留)"
