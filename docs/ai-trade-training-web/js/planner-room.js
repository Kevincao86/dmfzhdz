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

  function updateTabLinks(roomId) {
    document.querySelectorAll('.top-tab[href]').forEach((a) => {
      const href = a.getAttribute('href')
      if (!href || href.startsWith('http')) return
      const url = new URL(href, global.location.origin)
      if (roomId) url.searchParams.set('room', roomId)
      else url.searchParams.delete('room')
      a.setAttribute('href', url.pathname + url.search)
    })
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

    function applyRemote(state) {
      suppressPush = true
      applyToStore(state)
      suppressPush = false
      notifyUpdate()
    }

    sync = PlannerSync.createPlannerSync((state) => {
      applyRemote(state)
      const rid = sync.getRoomId()
      updateTabLinks(rid)
      setSyncText(rid ? `房间 ${rid} · 已同步` : '请先加入协作房间', rid ? 'online' : 'local')
    })

    function pushNow() {
      if (suppressPush || !sync) return
      const rid = sync.getRoomId()
      if (!rid || rid.length < 4) return
      void sync.pushCloud(snapshotFromStore()).then((ok) => {
        if (ok) setSyncText(`房间 ${rid} · 已保存`, 'online')
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
        notifyUpdate()
        setSyncText(
          ok ? `房间 ${code} · 已同步` : `房间 ${code} · 等待云端`,
          ok ? 'online' : 'local',
        )
      })
    }

    const params = new URLSearchParams(global.location.search)
    const urlRoom = params.get('room')
    const savedRoom = PlannerSync.loadRoomId()
    if (urlRoom) {
      joinRoom(urlRoom, true)
    } else if (savedRoom) {
      roomInput.value = savedRoom
      sync.setRoom(savedRoom)
      updateTabLinks(savedRoom)
      setSyncText(`房间 ${savedRoom} · 连接中…`, 'local')
      void sync.pullCloud().then((ok) => {
        notifyUpdate()
        setSyncText(
          ok ? `房间 ${savedRoom} · 云端已连接` : `房间 ${savedRoom} · 本机协作`,
          ok ? 'online' : 'local',
        )
      })
    } else {
      setSyncText('输入房间号加入，或新建房间', 'local')
    }

    sync.startPolling(2500)

    $('btnNewRoom')?.addEventListener('click', () => {
      const rid = PlannerSync.randomRoomId()
      sync.setRoom(rid)
      roomInput.value = rid
      PlannerStore.clearAll()
      updateTabLinks(rid)
      notifyUpdate()
      setSyncText(`新房间 ${rid}`, 'local')
      void sync.pushCloud(snapshotFromStore())
    })

    $('btnJoinRoom')?.addEventListener('click', () => joinRoom(roomInput.value))

    roomInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') joinRoom(roomInput.value)
    })

    return { pushNow, getRoomId: () => sync.getRoomId(), joinRoom }
  }

  global.PlannerRoom = {
    snapshotFromStore,
    applyToStore,
    initRoomBar,
    updateTabLinks,
  }
})(typeof window !== 'undefined' ? window : globalThis)
