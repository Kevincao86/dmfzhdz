const lingqiIdentity = require('./lingqiIdentity.js')

/** 按工作台身份生成资料页 / 我的页展示的 ID 文案（互斥，不混显达人 ID） */
function buildIdentityIdLabels(workIdentity, sources) {
  const member = sources && sources.member ? sources.member : {}
  const account = sources && sources.account ? sources.account : {}
  const shootId = String(member.lingqiShootTeamId || account.lingqiShootTeamId || '').trim()
  const editId = String(member.lingqiEditTeamId || account.lingqiEditTeamId || '').trim()
  const talentId = String(member.lingqiTalentId || account.lingqiTalentId || '').trim()

  const out = {
    lingqiTalentIdLabel: '',
    lingqiShootTeamIdLabel: '',
    lingqiEditTeamIdLabel: '',
  }

  if (workIdentity === 'shoot') {
    out.lingqiShootTeamIdLabel = lingqiIdentity.formatShootTeamIdLabel(shootId)
    return out
  }
  if (workIdentity === 'edit') {
    out.lingqiEditTeamIdLabel = lingqiIdentity.formatEditTeamIdLabel(editId)
    return out
  }
  if (workIdentity === 'talent') {
    out.lingqiTalentIdLabel = lingqiIdentity.formatTalentIdLabel(talentId)
  }
  return out
}

function pickPrimaryTeamId(workIdentity, sources) {
  const labels = buildIdentityIdLabels(workIdentity, sources)
  if (workIdentity === 'shoot') {
    return String((sources && sources.member && sources.member.lingqiShootTeamId) || (sources && sources.account && sources.account.lingqiShootTeamId) || '').trim()
  }
  if (workIdentity === 'edit') {
    return String((sources && sources.member && sources.member.lingqiEditTeamId) || (sources && sources.account && sources.account.lingqiEditTeamId) || '').trim()
  }
  return ''
}

module.exports = {
  buildIdentityIdLabels,
  pickPrimaryTeamId,
}
