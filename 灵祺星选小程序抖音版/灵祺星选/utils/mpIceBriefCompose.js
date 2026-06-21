const BRAND_NOISE_RE = /灵祺\s*AI?|智能\s*ERP|云剪|Lingqi/gi

function sanitize(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.replace(BRAND_NOISE_RE, '').replace(/\s{2,}/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

function composeIceEditBrief(copy, instruction) {
  const c = String(copy || '').trim()
  const i = String(instruction || '').trim()
  if (c && i) return `【剪辑指令】\n${i}\n\n【字幕文案】\n${c}`
  if (c) return `【字幕文案】\n${c}`
  if (i) return `【剪辑指令】\n${i}`
  return ''
}

function splitIceEditBrief(brief) {
  const raw = String(brief || '').trim()
  if (!raw) return { copy: '', instruction: '' }
  const instMatch = raw.match(/【剪辑指令】\s*([\s\S]*?)(?=\n*【字幕文案】|$)/)
  const copyMatch = raw.match(/【字幕文案】\s*([\s\S]*?)(?=\n*【|$)/)
  const instruction = instMatch && instMatch[1] ? instMatch[1].trim() : ''
  const copy = copyMatch && copyMatch[1] ? copyMatch[1].trim() : ''
  if (instruction || copy) return { copy, instruction }
  const quoted = []
  const re = /[「『"]([^」』"]{2,36})[」』"]/g
  let m
  while ((m = re.exec(raw))) {
    if (m[1]) quoted.push(m[1].trim())
  }
  if (quoted.length) return { copy: quoted.join('\n'), instruction: raw }
  return { copy: '', instruction: raw }
}

module.exports = {
  sanitize,
  composeIceEditBrief,
  splitIceEditBrief,
}
