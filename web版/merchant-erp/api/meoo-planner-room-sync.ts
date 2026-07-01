/**
 * POST/GET /api/meoo-planner-room-sync — 方案规划器协作房间（内存暂存，48h TTL）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

type RoomPayload = {
  room: string
  clientId?: string
  editorName?: string
  version?: number
  state?: unknown
  updatedAt?: string
}

const TTL_MS = 48 * 60 * 60 * 1000
const rooms = new Map<string, RoomPayload>()

function prune() {
  const now = Date.now()
  for (const [k, v] of rooms) {
    const t = Date.parse(v.updatedAt || '')
    if (!t || now - t > TTL_MS) rooms.delete(k)
  }
}

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  cors(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  prune()

  if (req.method === 'GET') {
    const room = String(req.query.room ?? '').trim().toUpperCase()
    if (!room) {
      json(res, 400, { ok: false, error: 'room_required' })
      return
    }
    const hit = rooms.get(room)
    if (!hit) {
      json(res, 200, { ok: true, room, version: 0, state: null })
      return
    }
    json(res, 200, {
      ok: true,
      room,
      version: hit.version ?? 0,
      state: hit.state ?? null,
      editorName: hit.editorName ?? null,
      updatedAt: hit.updatedAt ?? null,
    })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  let body: RoomPayload
  try {
    const raw =
      typeof req.body === 'string'
        ? req.body
        : req.body && typeof req.body === 'object'
          ? JSON.stringify(req.body)
          : '{}'
    body = JSON.parse(raw || '{}') as RoomPayload
  } catch {
    json(res, 400, { ok: false, error: 'invalid_json' })
    return
  }

  const room = String(body.room ?? '').trim().toUpperCase()
  if (!room || room.length < 4) {
    json(res, 400, { ok: false, error: 'invalid_room' })
    return
  }

  const version = typeof body.version === 'number' ? body.version : Date.now()
  const existing = rooms.get(room)
  if (existing && typeof existing.version === 'number' && version < existing.version) {
    json(res, 409, {
      ok: false,
      error: 'stale_version',
      version: existing.version,
      state: existing.state ?? null,
    })
    return
  }

  const payload: RoomPayload = {
    room,
    clientId: body.clientId,
    editorName: body.editorName,
    version,
    state: body.state,
    updatedAt: new Date().toISOString(),
  }
  rooms.set(room, payload)
  json(res, 200, { ok: true, room, version })
}
