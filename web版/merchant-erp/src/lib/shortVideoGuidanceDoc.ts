/** 执导文案文档解析（浏览器端，支持 txt / docx / 简易 doc） */

const DOCX_MAIN = 'word/document.xml'

function parseWordXmlPlainText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    const matches = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    return matches
      .map((m) => m[1] ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  }
  const nodes = doc.getElementsByTagName('w:t')
  const parts: string[] = []
  for (let i = 0; i < nodes.length; i++) {
    const t = nodes.item(i)?.textContent
    if (t) parts.push(t)
  }
  return parts.join('').replace(/\s+/g, ' ').trim()
}

async function inflateDeflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持解压 docx，请改用 .txt 或复制正文粘贴')
  }
  const ds = new DecompressionStream('deflate-raw')
  const out = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer()
  return new Uint8Array(out)
}

/** 从 docx（ZIP）中提取 word/document.xml */
async function extractZipEntryText(ab: ArrayBuffer, entryPath: string): Promise<string | null> {
  const view = new DataView(ab)
  const u8 = new Uint8Array(ab)
  let offset = 0
  while (offset + 30 < u8.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break
    const compMethod = view.getUint16(offset + 8, true)
    const compSize = view.getUint32(offset + 18, true)
    const fileNameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = new TextDecoder().decode(u8.subarray(nameStart, nameStart + fileNameLen))
    const dataStart = nameStart + fileNameLen + extraLen
    const data = u8.subarray(dataStart, dataStart + compSize)
    offset = dataStart + compSize
    if (name !== entryPath) continue
    let raw: Uint8Array
    if (compMethod === 0) raw = data
    else if (compMethod === 8) raw = await inflateDeflateRaw(data)
    else throw new Error('不支持的 docx 压缩格式，请另存为 .txt 后上传')
    return new TextDecoder().decode(raw)
  }
  return null
}

async function extractDocxPlainText(file: File): Promise<string> {
  const xml = await extractZipEntryText(await file.arrayBuffer(), DOCX_MAIN)
  if (!xml) throw new Error('未在 docx 中找到正文，请确认文件未损坏')
  const text = parseWordXmlPlainText(xml)
  if (!text) throw new Error('docx 正文为空')
  return text
}

/** 旧版 .doc 简易抽取（复杂排版可能不全，建议优先 docx） */
function extractLegacyDocPlainText(ab: ArrayBuffer): string {
  const u8 = new Uint8Array(ab)
  const chunks: string[] = []
  let i = 0
  while (i + 1 < u8.length) {
    const lo = u8[i]!
    const hi = u8[i + 1]!
    if (hi === 0 && lo >= 0x20 && lo < 0x7f) {
      let s = ''
      while (i + 1 < u8.length) {
        const a = u8[i]!
        const b = u8[i + 1]!
        if (b !== 0 || a < 0x20) break
        if (a >= 0x7f) break
        s += String.fromCharCode(a)
        i += 2
      }
      if (s.length >= 4) chunks.push(s)
      continue
    }
    i += 1
  }
  const joined = chunks.join(' ').replace(/\s+/g, ' ').trim()
  if (joined.length >= 8) return joined
  throw new Error('无法解析 .doc 正文，请在 Word 中「另存为」.docx 或 .txt 后重新上传')
}

async function readPlainTextFile(file: File): Promise<string> {
  const text = await file.text()
  const t = text.replace(/\u0000/g, '').trim()
  if (!t) throw new Error('文档内容为空')
  return t
}

export function isGuidanceDocFile(file: File): boolean {
  const name = (file.name || '').toLowerCase()
  const mime = (file.type || '').toLowerCase()
  if (/\.(txt|md|docx?)$/i.test(name)) return true
  if (mime.startsWith('text/')) return true
  if (mime.includes('word') || mime.includes('msword') || mime.includes('officedocument')) return true
  return false
}

export async function parseGuidanceDocumentFile(file: File): Promise<string> {
  const name = (file.name || '').toLowerCase()
  const mime = (file.type || '').toLowerCase()

  if (/\.(txt|md)$/i.test(name) || (mime.startsWith('text/') && !name.endsWith('.doc'))) {
    return readPlainTextFile(file)
  }
  if (name.endsWith('.docx') || mime.includes('officedocument.wordprocessingml')) {
    return extractDocxPlainText(file)
  }
  if (name.endsWith('.doc') || mime.includes('msword')) {
    return extractLegacyDocPlainText(await file.arrayBuffer())
  }
  throw new Error('请上传 .txt、.doc 或 .docx 指导文案文件')
}
