import { mpErpApiBase, buildMpErpApiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'
import { getCurrentParticipant } from './participant'

const PATH = '/api/meoo-ops-mp-order-group-chat'
export const GROUP_POLL_MS = 3000

export type OrderGroupMessage = {
  id: string
  type: string
  text: string
  mediaUrl: string
  durationSec: number
  latitude?: number
  longitude?: number
  locationName: string
  fileName: string
  mentionKeys: string[]
  fromName: string
  fromParticipantKey: string
  mine: boolean
  at: string
  ts: number
  previewLabel: string
}

export type OrderGroupSession = {
  id: string
  mpOrderId: string
  title: string
  memberCount: number
  lastText: string
  timeText: string
  closed: boolean
}

export type OrderGroupPayload = {
  id?: string
  mpOrderId?: string
  title?: string
  status?: string
  memberParticipantKeys?: string[]
  memberNames?: Record<string, string>
  messages?: Record<string, unknown>[]
  lastMessageAt?: string
  createdAt?: string
}

function throwApiError(data: Record<string, unknown>) {
  const detail = String(data.detail || '').trim()
  const hint = String(data.hint || '').trim()
  const code = String(data.error || 'request_failed').trim()
  throw new Error([detail, hint, code].filter(Boolean).join(' — ') || '请求失败')
}

async function viaApi(payload: Record<string, unknown>) {
  const base = mpErpApiBase()
  if (!base) throw new Error('未配置 VITE_MP_API_BASE')
  const res = await fetch(buildMpErpApiUrl(base, PATH), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { 'X-Mp-Session': getToken()! } : {}),
    },
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok || data.ok === false) throwApiError(data)
  return data
}

export function myParticipantKey() {
  return String(getCurrentParticipant().participantKey || '').trim()
}

export function canOrderGroupChat() {
  return !!mpErpApiBase()
}

export function formatTime(ts: number) {
  const d = new Date(ts || Date.now())
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function messagePreview(m: Record<string, unknown> | null | undefined): string {
  const type = m && m.type
  if (type === 'image') return '[图片]'
  if (type === 'video') return '[视频]'
  if (type === 'audio') return '[语音]'
  if (type === 'location') return `[位置] ${String(m?.locationName || '').trim()}`.trim()
  if (type === 'file') return `[文件] ${String(m?.fileName || '文件')}`
  return String(m?.text || '').trim() || '暂无消息'
}

export function mapMessages(group: OrderGroupPayload | null | undefined, myKey: string): OrderGroupMessage[] {
  const list = group && Array.isArray(group.messages) ? group.messages : []
  return list.map((raw) => {
    const m = raw as Record<string, unknown>
    return {
      id: String(m.id || ''),
      type: String(m.type || 'text'),
      text: String(m.text || ''),
      mediaUrl: String(m.mediaUrl || ''),
      durationSec: Number(m.durationSec) || 0,
      latitude: m.latitude as number | undefined,
      longitude: m.longitude as number | undefined,
      locationName: String(m.locationName || ''),
      fileName: String(m.fileName || ''),
      mentionKeys: Array.isArray(m.mentionKeys) ? (m.mentionKeys as string[]) : [],
      fromName: String(m.fromName || '成员'),
      fromParticipantKey: String(m.fromParticipantKey || ''),
      mine: String(m.fromParticipantKey) === String(myKey),
      at: formatTime(Number(m.ts) || 0),
      ts: Number(m.ts) || 0,
      previewLabel: messagePreview(m),
    }
  })
}

export function mapMentionMembers(group: OrderGroupPayload | null | undefined, myKey: string) {
  const keys = (group && group.memberParticipantKeys) || []
  const names = (group && group.memberNames) || {}
  return keys
    .filter((k) => k && String(k) !== String(myKey))
    .map((k) => ({
      key: k,
      name: String(names[k] || '成员').trim() || '成员',
    }))
}

function lastMessagePreview(group: OrderGroupPayload | null | undefined) {
  const list = group && Array.isArray(group.messages) ? group.messages : []
  const last = list.length ? (list[list.length - 1] as Record<string, unknown>) : null
  if (!last) return '暂无消息'
  return messagePreview(last)
}

export function mapGroupSessions(groups: OrderGroupPayload[] | null | undefined): OrderGroupSession[] {
  return (groups || []).map((g) => {
    const list = g && Array.isArray(g.messages) ? g.messages : []
    const last = list.length ? (list[list.length - 1] as Record<string, unknown>) : null
    const ts =
      (last && Number(last.ts)) ||
      Date.parse(String(g.lastMessageAt || g.createdAt || '').replace(/-/g, '/')) ||
      0
    return {
      id: String(g.id || g.mpOrderId || ''),
      mpOrderId: String(g.mpOrderId || ''),
      title: String(g.title || '商单群'),
      memberCount: (g.memberParticipantKeys || []).length,
      lastText: lastMessagePreview(g),
      timeText: formatTime(ts),
      closed: g.status === 'closed',
    }
  })
}

export async function createGroup(mpOrderId: string) {
  return viaApi({
    action: 'create',
    mpOrderId,
    participantKey: myParticipantKey(),
  })
}

export async function getGroup(mpOrderId: string) {
  return viaApi({
    action: 'get',
    mpOrderId,
    participantKey: myParticipantKey(),
  })
}

export async function listMine() {
  return viaApi({
    action: 'list_mine',
    participantKey: myParticipantKey(),
  })
}

export async function sendGroupMessage(
  mpOrderId: string,
  payload: {
    type?: string
    text?: string
    mediaUrl?: string
    durationSec?: number
    latitude?: number
    longitude?: number
    locationName?: string
    fileName?: string
    mentionKeys?: string[]
  },
) {
  return viaApi({
    action: 'send',
    mpOrderId,
    participantKey: myParticipantKey(),
    type: payload.type || 'text',
    text: payload.text || '',
    mediaUrl: payload.mediaUrl || '',
    durationSec: payload.durationSec || 0,
    latitude: payload.latitude,
    longitude: payload.longitude,
    locationName: payload.locationName || '',
    fileName: payload.fileName || '',
    mentionKeys: payload.mentionKeys || [],
  })
}

export async function uploadGroupMedia(file: File) {
  const contentType = file.type || 'image/jpeg'
  const fileName = file.name || 'chat.jpg'
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  const contentBase64 = btoa(binary)
  return viaApi({
    action: 'upload_media',
    contentBase64,
    contentType,
    fileName,
  })
}

export async function fileToGroupMediaUrl(file: File): Promise<string> {
  const out = await uploadGroupMedia(file)
  const url = String(out.url || out.mediaUrl || '').trim()
  if (!url) throw new Error('上传失败')
  return url
}
