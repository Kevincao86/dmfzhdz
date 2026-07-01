/**
 * 协作房间 UI + 云端同步桥接（录入页 / 汇总页共用）
 */
(function (global) {
  function $(id) {
    return document.getElementById(id)
  }

  function snapshotFromStore() {
    return {
      entries: PlannerStore.loadEntries(),
      designResult: PlannerStore.loadDesign(),
      mockups: PlannerStore.loadMockups(),
      productType: PlannerStore.loadProductType(),
    }
  }

  function applyToStore(state) {
    if (!state || typeof state !== 'object') return
    if (Array.isArray(state.entries)) PlannerStore.saveEntries(state.entries)
    if (state.designResult !== undefined) PlannerStore.saveDesign(state.designResult || null)
    if (Array.isArray(state.mockups)) PlannerStore.saveMockups(state.mockups)
    if (state.productType) PlannerStore.saveProductType(state.productType)
  }

  function formatRoomLabel(rid, name) {
    const code = String(rid || '').trim()
    const label = String(name || '').trim()
    if (label && code) return `${label} · ${code}`
    return label || code || ''
  }

  function updateTabLinks(roomId) {
    document.querySelectorAll('.top-tab[href], #linkSummary, #linkSummaryInline').forEach((a) => {
      const href = a.getAttribute('href')
      if (!href || href.startsWith('http')) return
      const url = new URL(href, global.location.origin)
      if (roomId) url.searchParams.set('room', roomId)
      else url.searchParams.delete('room')
      a.setAttribute('href', url.pathname + url.search)
    })
  }

  function readRoomNameInput() {
    const el = $('roomName')
    return el ? String(el.value || '').trim().slice(0, 40) : PlannerSync.loadRoomName()
  }

  function setRoomNameInput(name) {
    const el = $('roomName')
    if (el) el.value = String(name || '').trim()
    if (name) PlannerSync.saveRoomName(name)
  }

  function initRoomBar(options) {
    const { onUpdate } = options || {}
    let sync = null
    let suppressPush = false

    const roomInput = $('roomId')
    const syncStatus = $('syncStatus')
    if (!roomInput) return null

    function setSyncText(text, kind) {
      if (!syncStatus) return
      syncStatus.textContent = text
      syncStatus.classList.remove('online', 'offline', 'local')
      if (kind) syncStatus.classList.add(kind)
    }

    function notifyUpdate() {
      if (typeof onUpdate === 'function') onUpdate()
    }

    function applyRemote(state, meta) {
      suppressPush = true
      applyToStore(state)
      if (meta?.roomName) setRoomNameInput(meta.roomName)
      suppressPush = false
      notifyUpdate()
    }

    sync = PlannerSync.createPlannerSync((state, meta) => {
      applyRemote(state, meta)
      const rid = sync.getRoomId()
      const name = sync.getRoomName()
      updateTabLinks(rid)
      if (rid) {
        setSyncText(`${formatRoomLabel(rid, name) || rid} · 已同步`, 'online')
      } else {
        setSyncText('请先加入协作房间', 'local')
      }
    })

    function pushNow() {
      if (suppressPush || !sync) return
      const rid = sync.getRoomId()
      if (!rid || rid.length < 4) return
      const roomName = readRoomNameInput()
      sync.setRoomName(roomName)
      void sync.pushCloud(snapshotFromStore(), { roomName }).then((ok) => {
        if (ok) {
          setSyncText(`${formatRoomLabel(rid, roomName) || rid} · 已保存`, 'online')
        }
      })
    }

    function joinRoom(rid, silent) {
      const code = String(rid || '')
        .trim()
        .toUpperCase()
      if (code.length < 4) {
        if (!silent) setSyncText('房间号至少 4 位', 'offline')
        return
      }
      sync.setRoom(code)
      roomInput.value = code
      updateTabLinks(code)
      if (!silent) setSyncText(`加入 ${code}…`, 'local')
      void sync.pullCloud().then((ok) => {
        setRoomNameInput(sync.getRoomName())
        notifyUpdate()
        const name = sync.getRoomName()
        setSyncText(
          ok
            ? `${formatRoomLabel(code, name) || code} · 已同步`
            : `${formatRoomLabel(code, name) || code} · 等待云端`,
          ok ? 'online' : 'local',
        )
      })
    }

    const params = new URLSearchParams(global.location.search)
    const urlRoom = params.get('room')
    const savedRoom = PlannerSync.loadRoomId()
    setRoomNameInput(PlannerSync.loadRoomName())

    if (urlRoom) {
      joinRoom(urlRoom, true)
    } else if (savedRoom) {
      roomInput.value = savedRoom
      sync.setRoom(savedRoom)
      updateTabLinks(savedRoom)
      setSyncText(`${formatRoomLabel(savedRoom, sync.getRoomName()) || savedRoom} · 连接中…`, 'local')
      void sync.pullCloud().then((ok) => {
        setRoomNameInput(sync.getRoomName())
        notifyUpdate()
        const name = sync.getRoomName()
        setSyncText(
          ok
            ? `${formatRoomLabel(savedRoom, name) || savedRoom} · 云端已连接`
            : `${formatRoomLabel(savedRoom, name) || savedRoom} · 本机协作`,
          ok ? 'online' : 'local',
        )
      })
    } else {
      setSyncText('输入房间号加入，或新建房间', 'local')
    }

    sync.startPolling(2500)

    $('btnNewRoom')?.addEventListener('click', () => {
      const rid = PlannerSync.randomRoomId()
      const roomName = readRoomNameInput()
      sync.setRoom(rid, { roomName })
      roomInput.value = rid
      PlannerStore.clearAll()
      updateTabLinks(rid)
      notifyUpdate()
      setSyncText(`新房间 ${formatRoomLabel(rid, roomName) || rid}`, 'local')
      void sync.pushCloud(snapshotFromStore(), { roomName })
    })

    $('btnJoinRoom')?.addEventListener('click', () => joinRoom(roomInput.value))

    roomInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') joinRoom(roomInput.value)
    })

    $('roomName')?.addEventListener('change', () => {
      const name = readRoomNameInput()
      sync.setRoomName(name)
      const rid = sync.getRoomId()
      if (rid && rid.length >= 4) pushNow()
    })

    $('roomName')?.addEventListener('blur', () => {
      const name = readRoomNameInput()
      if (name !== sync.getRoomName()) {
        sync.setRoomName(name)
        const rid = sync.getRoomId()
        if (rid && rid.length >= 4) pushNow()
      }
    })

    return { pushNow, getRoomId: () => sync.getRoomId(), getRoomName: () => sync.getRoomName(), joinRoom }
  }

  global.PlannerRoom = {
    snapshotFromStore,
    applyToStore,
    initRoomBar,
    updateTabLinks,
    formatRoomLabel,
  }
})(typeof window !== 'undefined' ? window : globalThis)
