/**
 * 多人协作同步：协作房间 + 云端轮询 + 同浏览器多标签 BroadcastChannel
 */
(function (global) {
  const STORAGE_ROOM = 'planner_collab_room_v1'
  const STORAGE_EDITOR = 'planner_editor_name_v1'
  const SYNC_CANDIDATES = [
    'https://mofangdianai.com/erp-api/meoo-planner-room-sync',
    '/erp-api/meoo-planner-room-sync',
  ]

  function randomRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let s = ''
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }

  function clientId() {
    const k = 'planner_client_id'
    let id = localStorage.getItem(k)
    if (!id) {
      id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem(k, id)
    }
    return id
  }

  function loadRoomId() {
    return localStorage.getItem(STORAGE_ROOM) || ''
  }

  function saveRoomId(roomId) {
    if (roomId) localStorage.setItem(STORAGE_ROOM, roomId)
    else localStorage.removeItem(STORAGE_ROOM)
  }

  function loadEditorName() {
    return localStorage.getItem(STORAGE_EDITOR) || ''
  }

  function saveEditorName(name) {
    localStorage.setItem(STORAGE_EDITOR, String(name || '').trim())
  }

  function createPlannerSync(onRemote) {
    let roomId = loadRoomId()
    let pollTimer = null
    let lastVersion = 0
    let channel = null
    let applyingRemote = false

    function getRoomIdOrEmpty() {
      return String(roomId || loadRoomId() || '')
        .trim()
        .toUpperCase()
    }

    function requireRoom() {
      const rid = getRoomIdOrEmpty()
      return rid.length >= 4 ? rid : ''
    }

    function openChannel() {
      const rid = requireRoom()
      if (!rid || channel || typeof BroadcastChannel === 'undefined') return
      channel = new BroadcastChannel(`planner-room-${rid}`)
      channel.onmessage = (ev) => {
        const msg = ev.data
        if (!msg || msg.type !== 'state' || msg.clientId === clientId()) return
        if (msg.version > lastVersion) {
          lastVersion = msg.version
          applyingRemote = true
          onRemote(msg.state, msg.meta)
          applyingRemote = false
        }
      }
    }

    async function fetchSync(url, init) {
      const res = await fetch(url, { ...init, cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      return { ok: res.ok, j }
    }

    async function pullCloud() {
      const rid = requireRoom()
      if (!rid) return false
      for (const base of SYNC_CANDIDATES) {
        try {
          const { ok, j } = await fetchSync(`${base}?room=${encodeURIComponent(rid)}`)
          if (!ok || !j.ok) continue
          if (j.state && j.version > lastVersion) {
            lastVersion = j.version
            applyingRemote = true
            onRemote(j.state, { editorName: j.editorName, updatedAt: j.updatedAt, source: 'cloud' })
            applyingRemote = false
          }
          return true
        } catch {
          /* try next */
        }
      }
      return false
    }

    async function pushCloud(state) {
      if (applyingRemote) return false
      const rid = requireRoom()
      if (!rid) return false
      const version = Date.now()
      lastVersion = version
      const body = {
        room: rid,
        clientId: clientId(),
        editorName: loadEditorName() || '协作者',
        version,
        state,
      }
      openChannel()
      channel?.postMessage({ type: 'state', clientId: clientId(), version, state, meta: body })

      for (const base of SYNC_CANDIDATES) {
        try {
          const { ok } = await fetchSync(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (ok) return true
        } catch {
          /* try next */
        }
      }
      return false
    }

    function startPolling(intervalMs) {
      stopPolling()
      pollTimer = window.setInterval(() => void pullCloud(), intervalMs || 2500)
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }

    function setRoom(newRoom) {
      roomId = String(newRoom || '').trim().toUpperCase().slice(0, 12)
      saveRoomId(roomId)
      lastVersion = 0
      if (channel) {
        channel.close()
        channel = null
      }
      openChannel()
    }

    return {
      getRoomId: () => requireRoom() || getRoomIdOrEmpty(),
      setRoom,
      pullCloud,
      pushCloud,
      startPolling,
      stopPolling,
      loadEditorName,
      saveEditorName,
    }
  }

  global.PlannerSync = {
    randomRoomId,
    clientId,
    loadRoomId,
    saveRoomId,
    loadEditorName,
    saveEditorName,
    createPlannerSync,
  }
})(typeof window !== 'undefined' ? window : globalThis)
