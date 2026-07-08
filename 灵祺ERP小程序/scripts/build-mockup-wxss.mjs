#!/usr/bin/env node
/** 从 index.html 提取 v2 CSS，px → rpx（×2） */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(path.join(root, 'docs/ui-mockups/merchant-erp-mp/index.html'), 'utf8');
const m = html.match(/\/\* v2 — 对齐 AI 截图 \*\/([\s\S]*?)@media/);
if (!m) throw new Error('CSS block not found');
let css = m[1];
css = css.replace(/^\s+/gm, '');
css = css.replace(/var\(--phone-bg\)/g, '#f3f6fb');
css = css.replace(/(\d+(?:\.\d+)?)px/g, (_, n) => `${Math.round(parseFloat(n) * 2)}rpx`);
css = css.replace(/env\(safe-area-inset-bottom,\s*0\)/g, 'env(safe-area-inset-bottom)');

const WX_COMPAT = `
/* wxml 补充 class（小程序无 h1/strong 标签） */
.func-h1 { font-size: 40rpx; font-weight: 800; color: #0f172a; display: block; }
.func-p { font-size: 22rpx; color: #64748b; margin-top: 8rpx; display: block; }
.cell-strong { display: block; font-size: 22rpx; color: #0f172a; font-weight: 600; }
.cell-span { display: block; font-size: 18rpx; color: #94a3b8; margin-top: 4rpx; }
.list-strong { display: block; font-size: 26rpx; font-weight: 700; color: #0f172a; }
.list-span { display: block; font-size: 22rpx; color: #64748b; margin-top: 4rpx; }
.chip { padding: 12rpx 28rpx; border-radius: 999rpx; font-size: 22rpx; background: #fff; border: 1rpx solid #e2e8f0; color: #64748b; }
.chip.on { background: linear-gradient(95deg,#0ea5e9,#06b6d4); color: #fff; border: none; font-weight: 600; }
.line-tab { padding: 16rpx 4rpx 20rpx; font-size: 26rpx; color: #94a3b8; }
.line-tab.on { color: #0284c7; font-weight: 700; border-bottom: 4rpx solid #0284c7; }
.profile-strong { display: block; font-size: 30rpx; font-weight: 700; color: #0f172a; }
.profile-span { display: block; font-size: 22rpx; color: #64748b; margin-top: 4rpx; }
.sec-strong { display: block; font-size: 28rpx; font-weight: 800; color: #0f172a; }
.flow-num { width: 48rpx; height: 48rpx; border-radius: 50%; background: #e2e8f0; font-size: 22rpx; font-weight: 700; text-align: center; line-height: 48rpx; flex-shrink: 0; }
.flow-v2.on .flow-num { background: #0ea5e9; color: #fff; }
.pick-strong { display: block; font-size: 30rpx; font-weight: 800; }
.pick-p { display: block; font-size: 22rpx; color: #64748b; margin-top: 8rpx; }
.voice-strong { display: block; font-size: 32rpx; font-weight: 800; margin: 24rpx 0 12rpx; }
.voice-p { display: block; font-size: 24rpx; color: #64748b; margin-bottom: 32rpx; }
.kpi-b { display: block; font-size: 36rpx; font-weight: 800; color: #0284c7; }
.score-b { font-size: 96rpx; font-weight: 800; display: block; line-height: 1; }
.balance-b { font-size: 72rpx; font-weight: 800; color: #0284c7; display: block; }
.tier { text-align: center; padding: 24rpx 12rpx; background: #fff; border-radius: 24rpx; font-size: 22rpx; border: 2rpx solid #e2e8f0; }
.tier.on { border-color: #0ea5e9; background: #f0f9ff; color: #0284c7; font-weight: 700; }
.step { flex: 1; text-align: center; padding: 16rpx 8rpx; background: #fff; border-radius: 20rpx; font-size: 20rpx; color: #94a3b8; }
.step.on { background: #0ea5e9; color: #fff; font-weight: 700; }
.tl-em { color: #0284c7; font-weight: 700; margin-right: 16rpx; }
.bullet-item { display: block; font-size: 24rpx; color: #475569; margin-bottom: 8rpx; }
.sec-row-title { font-size: 26rpx; font-weight: 700; color: #0f172a; }
`;

writeFileSync(
  path.join(root, '灵祺ERP小程序/styles/mockup-base.wxss'),
  `/* 1:1 来自 docs/ui-mockups/merchant-erp-mp/index.html v2 CSS */\n${css}${WX_COMPAT}`,
);
console.log('mockup-base.wxss written');
