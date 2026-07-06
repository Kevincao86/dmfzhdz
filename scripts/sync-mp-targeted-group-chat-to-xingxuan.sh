#!/usr/bin/env bash
# 将微信达人撮合小程序的「定向邀约 + 商单群聊」逻辑同步到灵祺星选抖音版（路径映射 subpack → 扁平 pages）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/灵祺达人撮合小程序"
DEST="$ROOT/灵祺星选小程序抖音版/灵祺星选"

if [[ ! -d "$SRC" ]] || [[ ! -d "$DEST" ]]; then
  echo "缺少源或目标目录" >&2
  exit 1
fi

map_paths() {
  sed \
    -e "s|require('../../../utils/|require('../../utils/|g" \
    -e "s|require('../../../behaviors/|require('../../behaviors/|g" \
    -e "s|require('../../../partials/|require('../../partials/|g" \
    -e "s|/pages/subpack-core/|/pages/|g" \
    -e "s|/pages/subpack-pr/|/pages/|g" \
    -e "s|/pages/subpack-mine/|/pages/|g"
}

copy_mapped() {
  local rel_src="$1"
  local rel_dest="$2"
  local from="$SRC/$rel_src"
  local to="$DEST/$rel_dest"
  if [[ ! -f "$from" ]]; then
    echo "skip (missing src): $rel_src" >&2
    return 0
  fi
  mkdir -p "$(dirname "$to")"
  map_paths < "$from" > "$to"
  echo "sync: $rel_dest"
}

# utils（与群聊/通知跳转相关）
copy_mapped "utils/inboxNoticeCatalog.js" "utils/inboxNoticeCatalog.js"
copy_mapped "utils/mpOrderGroupChatApi.js" "utils/mpOrderGroupChatApi.js"
copy_mapped "utils/mpChatComposer.js" "utils/mpChatComposer.js"
copy_mapped "utils/mpChatEmoji.js" "utils/mpChatEmoji.js"
copy_mapped "utils/mpChatRichMessage.js" "utils/mpChatRichMessage.js"
copy_mapped "utils/talentChat.js" "utils/talentChat.js"
copy_mapped "utils/mpTargetedRecruit.js" "utils/mpTargetedRecruit.js"
copy_mapped "utils/recruitmentListFilters.js" "utils/recruitmentListFilters.js"

# 页面
copy_mapped "pages/messages/messages.js" "pages/messages/messages.js"
copy_mapped "pages/subpack-pr/order-group-chat/order-group-chat.js" "pages/order-group-chat/order-group-chat.js"
copy_mapped "pages/subpack-pr/order-group-chat/order-group-chat.wxml" "pages/order-group-chat/order-group-chat.wxml"
copy_mapped "pages/subpack-pr/order-group-chat/order-group-chat.wxss" "pages/order-group-chat/order-group-chat.wxss"
copy_mapped "pages/subpack-pr/mine-pr-targeted-manage/mine-pr-targeted-manage.js" "pages/mine-pr-targeted-manage/mine-pr-targeted-manage.js"
copy_mapped "pages/subpack-pr/mine-pr-targeted-manage/mine-pr-targeted-manage.wxml" "pages/mine-pr-targeted-manage/mine-pr-targeted-manage.wxml"
copy_mapped "pages/subpack-pr/mine-pr-targeted-manage/mine-pr-targeted-manage.wxss" "pages/mine-pr-targeted-manage/mine-pr-targeted-manage.wxss"
copy_mapped "pages/subpack-pr/chat/chat.js" "pages/chat/chat.js"
copy_mapped "pages/subpack-pr/chat/chat.wxml" "pages/chat/chat.wxml"
copy_mapped "pages/subpack-pr/chat/chat.wxss" "pages/chat/chat.wxss"
copy_mapped "pages/subpack-mine/mine-targeted-invites/mine-targeted-invites.js" "pages/mine-targeted-invites/mine-targeted-invites.js"
copy_mapped "pages/subpack-mine/mine-targeted-invites/mine-targeted-invites.wxml" "pages/mine-targeted-invites/mine-targeted-invites.wxml"
copy_mapped "pages/subpack-mine/mine-targeted-invites/mine-targeted-invites.wxss" "pages/mine-targeted-invites/mine-targeted-invites.wxss"
copy_mapped "pages/subpack-pr/mine-pr-orders/mine-pr-orders.js" "pages/mine-pr-orders/mine-pr-orders.js"

# 消息页 wxml：保留抖音 custom-tab-bar，其余与微信版对齐
MSG_WXML="$DEST/pages/messages/messages.wxml"
map_paths < "$SRC/pages/messages/messages.wxml" > "$MSG_WXML.tmp"
if ! grep -q 'mp-native-tab' "$MSG_WXML.tmp"; then
  sed -i '' 's/class="msg-page page-with-bar page-shell-fixed /class="msg-page page-with-bar page-shell-fixed mp-native-tab /' "$MSG_WXML.tmp" 2>/dev/null || \
    sed -i 's/class="msg-page page-with-bar page-shell-fixed /class="msg-page page-with-bar page-shell-fixed mp-native-tab /' "$MSG_WXML.tmp"
fi
if ! grep -q 'mp-tab-bar' "$MSG_WXML.tmp"; then
  perl -i -pe 's|^</view>$|  <mp-tab-bar id="mp-tab-bar" />\n</view>|' "$MSG_WXML.tmp"
fi
mv "$MSG_WXML.tmp" "$MSG_WXML"
echo "sync: pages/messages/messages.wxml (douyin tab-bar preserved)"

echo "OK: 定向邀约/商单群聊逻辑已同步 -> $DEST"
