import type { RegistryFile } from '../meooRegistryShared/opsRegistryTypes'

/** 注册表快照读写抽象：线上用 PostgREST fetch，dev 仍走磁盘网关 */
export type RegistrySnapshotIo = {
  load: () => Promise<RegistryFile>
  save: (data: RegistryFile) => Promise<void>
}
