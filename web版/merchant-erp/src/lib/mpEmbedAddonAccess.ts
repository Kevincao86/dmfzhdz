/** 履约 Web 嵌入模式下，从 localStorage 会话读取增值子板块开通（与 DR mpSession 同源） */
export type MpEmbedAddonAccess = {
  shortvideo: boolean
  cloudEdit: boolean
  digitalHuman: boolean
  brief: boolean
  any: boolean
  embedMode: boolean
}

const ALL_ON: MpEmbedAddonAccess = {
  shortvideo: true,
  cloudEdit: true,
  digitalHuman: true,
  brief: true,
  any: true,
  embedMode: false,
}

function expandLegacy(raw: Record<string, unknown> | null | undefined): MpEmbedAddonAccess {
  if (!raw || typeof raw !== 'object') return { ...ALL_ON, embedMode: false }
  const legacy = raw.addons === true
  const shortvideo = raw.shortvideo === true || (legacy && raw.shortvideo !== false)
  const cloudEdit = raw.cloudEdit === true || (legacy && raw.cloudEdit !== false)
  const digitalHuman = raw.digitalHuman === true || (legacy && raw.digitalHuman !== false)
  const brief = raw.brief === true
  const any = legacy || shortvideo || cloudEdit || digitalHuman || brief
  return { shortvideo, cloudEdit, digitalHuman, brief, any, embedMode: true }
}

export function readMpEmbedAddonAccess(): MpEmbedAddonAccess {
  if (typeof localStorage === 'undefined') return ALL_ON
  try {
    const raw = localStorage.getItem('lingqi_mp_account')
    if (!raw) return ALL_ON
    const acc = JSON.parse(raw) as { prFeatureAccess?: Record<string, unknown> }
    if (!acc?.prFeatureAccess) return ALL_ON
    return expandLegacy(acc.prFeatureAccess)
  } catch {
    return ALL_ON
  }
}
