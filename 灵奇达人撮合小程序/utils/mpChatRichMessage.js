const RICH_PREFIX = '{"t":'

function isRichPayload(text) {
  const s = String(text || '').trim()
  return s.startsWith(RICH_PREFIX) && s.includes('"url"')
}

function decode(text) {
  const raw = String(text || '').trim()
  if (!isRichPayload(raw)) {
    return { kind: 'text', text: raw }
  }
  try {
    const o = JSON.parse(raw)
    const kind = String(o.t || 'text')
    return {
      kind,
      text: String(o.caption || '').trim(),
      mediaUrl: String(o.url || '').trim(),
      durationSec: Number(o.dur) || 0,
      latitude: Number(o.lat),
      longitude: Number(o.lng),
      locationName: String(o.name || '').trim(),
      fileName: String(o.file || '').trim(),
    }
  } catch {
    return { kind: 'text', text: raw }
  }
}

function encode(payload) {
  const p = payload || {}
  const kind = String(p.kind || p.type || 'text')
  if (kind === 'text') return String(p.text || '').trim()
  const rich = { t: kind, url: String(p.mediaUrl || p.url || '').trim() }
  if (p.durationSec) rich.dur = Number(p.durationSec) || 0
  if (p.latitude != null) rich.lat = Number(p.latitude)
  if (p.longitude != null) rich.lng = Number(p.longitude)
  if (p.locationName) rich.name = String(p.locationName)
  if (p.fileName) rich.file = String(p.fileName)
  if (p.text) rich.caption = String(p.text)
  return JSON.stringify(rich)
}

function previewText(text) {
  const d = decode(text)
  if (d.kind === 'image') return '[图片]'
  if (d.kind === 'video') return '[视频]'
  if (d.kind === 'audio') return '[语音]'
  if (d.kind === 'location') return `[位置] ${d.locationName || ''}`.trim()
  if (d.kind === 'file') return `[文件] ${d.fileName || '文件'}`
  return d.text || ''
}

function uiFromRaw(row) {
  const d = decode(row && row.text != null ? row.text : '')
  return {
    ...row,
    kind: d.kind,
    displayText: d.kind === 'text' ? d.text : d.text || previewText(row.text),
    mediaUrl: d.mediaUrl || '',
    durationSec: d.durationSec || 0,
    latitude: d.latitude,
    longitude: d.longitude,
    locationName: d.locationName || '',
    fileName: d.fileName || '',
    previewLabel: previewText(row.text),
  }
}

module.exports = {
  decode,
  encode,
  previewText,
  uiFromRaw,
  isRichPayload,
}
