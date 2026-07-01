/**
 * POST/GET /api/meoo-planner-room-sync — 方案规划器协作房间（文件持久化，48h TTL）
 */
import fs from 'fs'
import path from 'path'
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
const ROOM_DIR = path.join(process.cwd(), 'data', 'planner-rooms')
const mem = new Map<string, RoomPayload>()

function roomFile(room: string) {
  const safe = room.replace(/[^A-Z0-9_-]/gi, '')
  return path.join(ROOM_DIR, `${safe}.json`)
}

function prune() {
  const now = Date.now()
  for (const [k, v] of mem) {
    const t = Date.parse(v.updatedAt || '')
    if (!t || now - t > TTL_MS) mem.delete(k)
  }
  try {
    if (!fs.existsSync(ROOM_DIR)) return
    for (const f of fs.readdirSync(ROOM_DIR)) {
      if (!f.endsWith('.json')) continue
      const fp = path.join(ROOM_DIR, f)
      const j = JSON.parse(fs.readFileSync(fp, 'utf8')) as RoomPayload
      const t = Date.parse(j.updatedAt || '')
      if (!t || now - t > TTL_MS) fs.unlinkSync(fp)
    }
  } catch {
    /* ignore */
  }
}

function readRoom(room: string): RoomPayload | null {
  if (mem.has(room)) return mem.get(room) || null
  try {
    const fp = roomFile(room)
    if (!fs.existsSync(fp)) return null
    const j = JSON.parse(fs.readFileSync(fp, 'utf8')) as RoomPayload
    mem.set(room, j)
    return j
  } catch {
    return null
  }
}

function writeRoom(payload: RoomPayload) {
  mem.set(payload.room, payload)
  fs.mkdirSync(ROOM_DIR, { recursive: true })
  fs.writeFileSync(roomFile(payload.room), JSON.stringify(payload, null, 2), 'utf8')
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
    const hit = readRoom(room)
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
  const existing = readRoom(room)
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
  writeRoom(payload)
  json(res, 200, { ok: true, room, version })
}
