import { parseGuidanceDocumentFile } from './shortVideoGuidanceDoc.js'

export type AddonComplianceMode = 'video' | 'script'

export type AddonComplianceItem = {
  id: string
  label: string
  kind: 'file' | 'link'
  file?: File
  videoUrl?: string
  scriptUrl?: string
  scriptLinkUrl?: string
  scriptText?: string
  status: 'idle' | 'uploading' | 'checking' | 'done' | 'error'
  statusText?: string
  statusTone?: 'checking' | 'pass' | 'warn' | ''
  detail?: string
}

export function newAddonComplianceItemId(): string {
  return `ac-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function readScriptFileText(file: File): Promise<string> {
  const name = String(file.name || '').toLowerCase()
  if (name.endsWith('.doc') || name.endsWith('.docx')) {
    return parseGuidanceDocumentFile(file)
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').slice(0, 12000))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file)
  })
}

export function isVideoFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  return mime.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi)$/i.test(name)
}

export function isScriptFile(file: File): boolean {
  const name = (file.name || '').toLowerCase()
  return /\.(txt|doc|docx)$/i.test(name) || (file.type || '').includes('text')
}

export function extractHttpUrl(raw: string): string {
  const s = String(raw || '').trim()
  const m = s.match(/https?:\/\/[^\s]+/i)
  return m ? m[0].replace(/[)\]}>,，。；;]+$/, '') : s
}
