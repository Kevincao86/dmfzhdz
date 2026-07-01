/**
 * 房间总览 — 全部协作房间汇总
 */
(function () {
  const $ = (id) => document.getElementById(id)

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function formatTime(iso) {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('zh-CN', { hour12: false })
    } catch {
      return iso
    }
  }

  function renderRows(rooms) {
    const tbody = $('roomsTableBody')
    const empty = $('roomsEmpty')
    const stats = $('overviewStats')
    if (!tbody) return

    if (!rooms.length) {
      tbody.innerHTML = ''
      if (empty) empty.hidden = false
      if (stats) stats.textContent = '暂无房间数据'
      return
    }

    if (empty) empty.hidden = true

    let totalEntries = 0
    let totalDesign = 0
    for (const r of rooms) {
      totalEntries += r.entryCount || 0
      if (r.hasDesign) totalDesign += 1
    }
    if (stats) {
      stats.textContent = `共 ${rooms.length} 个房间 · ${totalEntries} 条岗位需求 · ${totalDesign} 个已生成整体方案`
    }

    tbody.innerHTML = rooms
      .map((r) => {
        const label = PlannerRoom.formatRoomLabel(r.room, r.roomName)
        const summaryHref = `summary.html?room=${encodeURIComponent(r.room)}`
        const inputHref = `index.html?room=${encodeURIComponent(r.room)}`
        return `
        <tr>
          <td>
            <strong>${escapeHtml(r.roomName || '未命名')}</strong>
            <div class="rooms-code">${escapeHtml(r.room)}</div>
          </td>
          <td class="num">${r.entryCount || 0}</td>
          <td class="num">${r.industryCount || 0}</td>
          <td class="num">${r.roleCount || 0}</td>
          <td>${r.hasDesign ? '<span class="pill pill-ok">已生成</span>' : '<span class="pill">—</span>'}</td>
          <td class="muted">${escapeHtml(r.editorName || '—')}</td>
          <td class="muted">${escapeHtml(formatTime(r.updatedAt))}</td>
          <td class="rooms-actions">
            <a class="btn btn-ghost btn-sm" href="${summaryHref}">汇总</a>
            <a class="btn btn-ghost btn-sm" href="${inputHref}">录入</a>
            <button type="button" class="btn btn-primary btn-sm btn-join-room" data-room="${escapeHtml(r.room)}" data-name="${escapeHtml(r.roomName || '')}">加入</button>
          </td>
        </tr>`
      })
      .join('')

    tbody.querySelectorAll('.btn-join-room').forEach((btn) => {
      btn.addEventListener('click', () => {
        const room = btn.getAttribute('data-room')
        const name = btn.getAttribute('data-name') || ''
        if (!room) return
        PlannerSync.saveRoomId(room)
        if (name) PlannerSync.saveRoomName(name)
        window.location.href = `summary.html?room=${encodeURIComponent(room)}`
      })
    })
  }

  async function loadRooms() {
    const status = $('overviewStatus')
    if (status) status.textContent = '正在加载全部房间…'
    const rooms = await PlannerSync.fetchRoomList()
    if (rooms === null) {
      if (status) {
        status.textContent = '无法连接云端房间列表（请确认已部署轻量 API，或稍后重试）'
        status.classList.add('error')
      }
      renderRows([])
      return
    }
    if (status) {
      status.textContent = `已更新 · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
      status.classList.remove('error')
      status.classList.add('ok')
    }
    renderRows(rooms)
  }

  function bindEvents() {
    $('btnRefreshRooms')?.addEventListener('click', () => void loadRooms())
  }

  async function init() {
    bindEvents()
    await loadRooms()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init())
  } else {
    void init()
  }
})()
