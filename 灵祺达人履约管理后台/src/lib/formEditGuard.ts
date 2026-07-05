/** 用户正在编辑表单时，禁止注册表/云端回填覆盖本地草稿 */
let locked = false

export function isFormEditLocked(): boolean {
  return locked
}

export function lockFormEditing(): void {
  locked = true
}

export function unlockFormEditing(): void {
  locked = false
}
