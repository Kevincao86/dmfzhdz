function countFreeEditPackSlots(mp) {
  return (mp.iceVideoSlots || []).filter((s) => !String(s.assignedApplicantId || '').trim()).length
}

module.exports = { countFreeEditPackSlots }
