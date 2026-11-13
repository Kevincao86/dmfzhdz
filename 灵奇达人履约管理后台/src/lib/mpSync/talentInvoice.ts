export type TalentInvoiceRow = {
  key: string
  applicantId: string
  name: string
  url: string
  fileName: string
}

export function orderRequiresTalentInvoice(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  if (mp.requireTalentInvoice === true) return true
  const meta = mp.mpPublishMeta
  return !!(meta && typeof meta === 'object' && (meta as Record<string, unknown>).requireTalentInvoice === true)
}

export function collectTalentInvoices(mp: Record<string, unknown> | null | undefined): TalentInvoiceRow[] {
  const apps = mp && Array.isArray(mp.applicants) ? (mp.applicants as Record<string, unknown>[]) : []
  const rows: TalentInvoiceRow[] = []
  for (const a of apps) {
    const files = Array.isArray(a.talentInvoices) ? (a.talentInvoices as Record<string, unknown>[]) : []
    const name = String(a.platformNickname || a.name || '达人').trim() || '达人'
    files.forEach((f, i) => {
      const url = String(f?.url || '').trim()
      if (!/^https:\/\//i.test(url)) return
      const fileName = safeFileName(String(f?.fileName || ''), `${name}-${i + 1}.jpg`)
      rows.push({
        key: `${String(a.id || 'a')}-${i}`,
        applicantId: String(a.id || ''),
        name,
        url,
        fileName,
      })
    })
  }
  return rows
}

function safeFileName(raw: string, fallback: string): string {
  const name = raw.trim().replace(/[\\/:*?"<>|]/g, '')
  return name || fallback
}

function saveBlob(data: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(data)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('图片暂时下不下来')
  return new Uint8Array(await res.arrayBuffer())
}

export async function downloadOneInvoice(row: TalentInvoiceRow): Promise<void> {
  try {
    const bytes = await fetchBytes(row.url)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    saveBlob(new Blob([copy]), row.fileName)
  } catch {
    window.open(row.url, '_blank', 'noopener')
  }
}

export async function downloadInvoiceImages(rows: TalentInvoiceRow[]): Promise<void> {
  for (const row of rows) {
    await downloadOneInvoice(row)
  }
}

export async function downloadInvoiceZip(rows: TalentInvoiceRow[], zipName: string): Promise<void> {
  const files: { name: string; data: Uint8Array }[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const data = await fetchBytes(row.url)
    files.push({ name: `${String(i + 1).padStart(2, '0')}-${row.name}-${row.fileName}`, data })
  }
  const zipped = buildStoredZip(files)
  const copy = new Uint8Array(zipped.byteLength)
  copy.set(zipped)
  saveBlob(new Blob([copy], { type: 'application/zip' }), zipName)
}

function crc32(data: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]!
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function buildStoredZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = enc.encode(file.name)
    const crc = crc32(file.data)
    const local = new Uint8Array(30 + name.length + file.data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true)
    lv.setUint16(8, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, file.data.length, true)
    lv.setUint32(22, file.data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(file.data, 30 + name.length)
    locals.push(local)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, file.data.length, true)
    cv.setUint32(24, file.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + end.length)
  let p = 0
  for (const b of locals) {
    out.set(b, p)
    p += b.length
  }
  for (const b of centrals) {
    out.set(b, p)
    p += b.length
  }
  out.set(end, p)
  return out
}
