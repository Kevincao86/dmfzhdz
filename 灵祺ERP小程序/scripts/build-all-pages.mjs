#!/usr/bin/env node
/**
 * 生成 mockup v2 页面 wxml（绑定对齐各页 .js）
 * login / functions / mine / 招募导航 手写或已 OK 则跳过
 * 复杂向导页由 copy-complex-wxml.sh 从灵祺小程序复制
 */
import { writeFileSync, mkdirSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '..');
const SRC_MP = path.join(REPO, '灵祺小程序');
const PAGES_DIR = path.join(ROOT, 'pages');

const SKIP = new Set([
  'login',
  'functions',
  'mine',
  'recruit-hub',
  'recruit-flow',
  'recruit-publish-pick',
  'recruit-brief-records',
  'finance-tax',
]);

const COPY_COMPLEX = [
  'agent',
  'product-create',
  'product-voice',
  'recruit-voice',
  'shortvideo-voice',
  'recruit-novice',
  'recruit-pro',
  'recruit-brief-wizard',
  'ai-content',
  'shortvideo-ai',
  'product-edit',
  'shortvideo-edit',
  'recruit-edit',
  'geo-assist',
];

function w(page, content) {
  if (SKIP.has(page) || COPY_COMPLEX.includes(page)) return;
  const dir = path.join(PAGES_DIR, page);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${page}.wxml`), content.trim() + '\n');
  const wxss = path.join(dir, `${page}.wxss`);
  if (!existsSync(wxss) || readFileSync(wxss, 'utf8').includes('mockup-base')) {
    writeFileSync(wxss, '/* 见 styles/mockup-base.wxss + app.wxss */\n');
  }
  console.log('✔', page);
}

function pad(inner) {
  return `<scroll-view scroll-y class="page-pad-v2" enhanced show-scrollbar="{{false}}">${inner}</scroll-view>`;
}

function listPage({ forKey, title, sub, tag, err = 'err', loading = true, head = '' }) {
  const listInner = `  <view wx:for="{{${forKey}}}" wx:key="id" class="list-card-v2">
    <view>
      <text class="list-strong">{{${title}}}</text>
      ${sub ? `<text class="list-span">{{${sub}}}</text>` : ''}
    </view>
    ${tag ? `<text class="tag">{{${tag}}}</text>` : ''}
  </view>`;
  const cond = loading
    ? `<view wx:if="{{loading}}" class="hint-v2">加载中…</view>
<view wx:elif="{{${err}}}" class="hint-v2 err">{{${err}}}</view>
<view wx:elif="{{!${forKey}.length}}" class="hint-v2">暂无数据</view>
<block wx:else>
${listInner}
</block>`
    : `<view wx:if="{{!${forKey}.length}}" class="hint-v2">暂无数据</view>
<block wx:else>
${listInner}
</block>`;
  return pad(`${head}
${cond}`);
}

// —— Tab 页（已手写跳过）——

w('home', pad(`<view class="kpi-hero"><text class="kpi-big">工作台</text><text>已合并至灵祺AI Tab</text></view>
<navigator url="/pages/agent/agent" class="btn-v2 primary" open-type="switchTab">进入灵祺 AI</navigator>`));

w('dashboard', pad(`<view class="chip-row"><text class="chip on">{{rangeLabel}}</text></view>
<view class="kpi-grid-v2">
  <view wx:for="{{stats}}" wx:key="label"><text class="kpi-b">{{item.value}}</text><text>{{item.label}}</text></view>
</view>
<view wx:for="{{todos}}" wx:key="title" class="list-card-v2">
  <navigator url="{{item.url}}"><view><text class="list-strong">{{item.title}}</text><text class="list-span">{{item.sub}}</text></view><text class="chev">›</text></navigator>
</view>`));

w('module-detail', pad(`<view class="sec-card-v2"><text class="sec-strong">模块说明</text><text class="body">{{body}}</text></view>`));

w('store-list', `<view class="mp-page">
  <view class="mp-tabs">
    <view wx:for="{{tabs}}" wx:key="id" class="mp-tab {{platform === item.id ? 'active' : ''}}" data-id="{{item.id}}" bindtap="onTab">{{item.label}}</view>
  </view>
  <view wx:if="{{mode === 'decoration'}}" class="mp-banner">展示各平台门店名称与地址，装修素材请在对应平台商家中心维护。</view>
  <view wx:if="{{loading}}" class="mp-empty">加载中…</view>
  <view wx:elif="{{err}}" class="mp-err">{{err}}</view>
  <view wx:elif="{{!items.length}}" class="mp-empty">暂无门店数据</view>
  <scroll-view wx:else scroll-y class="mp-list-scroll">
    <view wx:for="{{items}}" wx:key="id" class="mp-list-card">
      <text class="mp-list-title">{{item.name}}</text>
      <text wx:if="{{item.address}}" class="mp-list-sub">{{item.address}}</text>
      <text class="mp-list-meta">ID {{item.id}}</text>
    </view>
    <view class="mp-list-footer"></view>
  </scroll-view>
</view>`);

w('product-list', listPage({
  forKey: 'displayItems',
  title: 'item.name',
  sub: 'item.statusLabel',
  tag: 'item.platformLabel',
  err: 'errMsg',
  head: `<view class="chip-row">
  <text wx:for="{{tabs}}" wx:key="id" class="chip {{activePlat === item.id ? 'on' : ''}}" data-id="{{item.id}}" bindtap="onTab">{{item.label}}</text>
</view>
<text wx:if="{{hintBanner}}" class="hint-v2">{{hintBanner}}</text>`,
}));

w('activity-center', listPage({
  forKey: 'items',
  title: 'item.title',
  sub: 'item.summary',
  tag: 'item.uiStatusLabel',
  head: `<view class="chip-row">
  <text wx:for="{{tabs}}" wx:key="id" class="chip {{platform === item.id ? 'on' : ''}}" data-id="{{item.id}}" bindtap="onTab">{{item.label}}</text>
</view>`,
}));

w('reviews-list', listPage({
  forKey: 'items',
  title: 'item.text',
  sub: 'item.replyStatus',
  tag: 'item.starsLabel',
  err: 'errMsg',
  head: `<view class="chip-row">
  <text wx:for="{{platUi}}" wx:key="id" class="chip {{activePlatTab === item.id ? 'on' : ''}}" data-id="{{item.id}}" bindtap="onPlat">{{item.label}}</text>
</view>`,
}));

w('recruitment', listPage({
  forKey: 'rows',
  title: 'item.id',
  sub: 'item.customerName',
  tag: 'item.statusLabel',
  head: `<text wx:if="{{filterHint}}" class="hint-v2">{{filterHint}}</text>`,
}));

w('recruit-talent-pool', pad(`<view wx:for="{{rows}}" wx:key="id" class="list-card-v2">
  <view><text class="list-strong">{{item.name}}</text><text class="list-span">{{item.meta}}</text></view>
</view>
<button class="btn-v2 primary" bindtap="onConfirm">确认达人名单</button>`));

w('recruit-schedule', listPage({
  forKey: 'rows',
  title: 'item.date',
  sub: 'item.text',
  loading: false,
  head: `<view class="sec-card-v2"><text class="sec-strong">AI 排期建议</text><text class="body">建议分批到店拍摄</text></view>`,
}));

w('recruit-video-review', listPage({
  forKey: 'cards',
  title: 'item.title',
  sub: 'item.sub',
  tag: 'item.tag',
}));

w('recruit-payment', pad(`<view class="sec-card-v2">
  <text class="sec-strong">结款账单</text>
  <text class="body">金额以财务与订单结算为准；确认后将生成打款单。</text>
  <view class="list-card-v2"><view><text class="list-strong">应付（待汇总）</text><text class="list-span">¥ —</text></view></view>
  <button class="btn-v2 primary" bindtap="onAck">确认打款</button>
</view>`));

w('ads-manage', listPage({ forKey: 'items', title: 'item.name', sub: 'item.sub', tag: 'item.status' }));
w('leads-center', listPage({ forKey: 'items', title: 'item.name', sub: 'item.sub', tag: 'item.status' }));
w('finance-reconcile', listPage({ forKey: 'items', title: 'item.title', sub: 'item.sub', tag: 'item.tag' }));

w('wallet', pad(`<view class="balance-v2"><text class="balance-b">{{balanceYuan}}</text><text>积分余额</text></view>
<button class="btn-v2 primary" bindtap="onOpenRecharge">积分充值</button>
<text class="hint-v2 center">Brief 8积分/篇</text>`));

w('notifications', pad(`<view wx:if="{{!items.length}}" class="hint-v2">暂无消息</view>
<block wx:else>
  <view wx:for="{{items}}" wx:key="id" class="list-card-v2">
    <view>
      <text class="list-strong">{{item.title}}</text>
      <text class="list-span">{{item.timeLabel}}</text>
    </view>
  </view>
</block>`));

w('subscription', pad(`<view class="sec-card-v2"><text class="sec-strong">{{planLabel}}</text><text class="body">{{expireText}}</text></view>
<view class="tier-v2"><text class="tier">基础</text><text class="tier on">专业</text><text class="tier">旗舰</text></view>
<button class="btn-v2 primary" bindtap="onOpenSubscribe">升级续费</button>`));

w('support-chat', `<view class="page-agent-v2">
  <scroll-view scroll-y class="chat-v2 tall" scroll-into-view="{{scrollTo}}" enhanced show-scrollbar="{{false}}">
    <view wx:for="{{messages}}" wx:key="id" id="msg-{{item.id}}" class="msg {{item.role === 'user' ? 'user' : 'bot'}}">
      <text wx:if="{{item.role !== 'user'}}" class="ava ava-ai">客</text>
      <view class="bubble-v2 {{item.role === 'user' ? 'user' : ''}}"><text user-select>{{item.content}}</text></view>
      <text wx:if="{{item.role === 'user'}}" class="ava ava-me">我</text>
    </view>
  </scroll-view>
  <view class="composer-v2">
    <input placeholder="输入消息" value="{{input}}" bindinput="onInput" confirm-type="send" bindconfirm="onSend" />
    <button class="btn-v2 primary sm" bindtap="onSend">发送</button>
  </view>
</view>`);

// 复制复杂页 wxml + wxss
for (const page of COPY_COMPLEX) {
  const srcDir = path.join(SRC_MP, 'pages', page);
  const dstDir = path.join(PAGES_DIR, page);
  mkdirSync(dstDir, { recursive: true });
  for (const ext of ['wxml', 'wxss']) {
    const src = path.join(srcDir, `${page}.${ext}`);
    const dst = path.join(dstDir, `${page}.${ext}`);
    if (existsSync(src)) {
      copyFileSync(src, dst);
      console.log('↪ copy', page, ext);
    } else {
      console.warn('⚠ missing', src);
    }
  }
}

console.log('done');
