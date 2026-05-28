function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 分享报名链接落地页（H5，引导打开小程序详情） */
export function mpRecruitApplyLandingHtml(mpId: string): string {
  const id = String(mpId || '').trim()
  const safe = escapeHtml(id)
  const miniPath = `pages/detail/detail?id=${encodeURIComponent(id)}`
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>灵祺达人招募 · 报名</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; line-height: 1.6; color: #0f172a; background: #f8fafc; }
    .card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 4px 24px rgba(15,23,42,.08); }
    h1 { font-size: 18px; margin: 0 0 12px; }
    .mono { font-size: 13px; color: #475569; word-break: break-all; }
    .steps { margin-top: 16px; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>灵祺达人招募</h1>
    <p class="mono">招募单号：${safe || '—'}</p>
    <p class="mono">小程序路径：${escapeHtml(miniPath)}</p>
    <div class="steps">
      <p>请使用微信打开「灵祺达人招募」小程序，在招募大厅找到本单，或联系发布者获取详情页报名。</p>
    </div>
  </div>
</body>
</html>`
}
