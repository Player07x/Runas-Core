import type { BackupCommit, BackupKind, BackupRow, BackupStore } from "./versioned-backup"

/**
 * `BackupStore` em memória, com a mesma semântica do D1: gravação atômica e
 * versão única por tipo. Serve aos testes e ao preview local; nunca ao
 * servidor publicado.
 */
export function createMemoryBackupStore(legacy: Partial<Record<BackupKind, { payload: string; updatedAt: number }>> = {}): BackupStore {
  const rows = new Map<BackupKind, BackupRow[]>()
  const chunks = new Map<string, Uint8Array[]>()
  const key = (kind: BackupKind, version: number) => `${kind}:${version}`
  return {
    async rows(kind) { return [...(rows.get(kind) ?? [])].sort((left, right) => right.version - left.version) },
    async chunks(kind, version) { return chunks.get(key(kind, version)) ?? [] },
    async legacyInfo(kind) { const item = legacy[kind]; return item ? { updatedAt: item.updatedAt, bytes: item.payload.length } : null },
    async legacyPayload(kind) { return legacy[kind]?.payload ?? null },
    async commit(kind, write: BackupCommit) {
      const current = rows.get(kind) ?? []
      if (current.some((row) => row.version === write.row.version)) return false
      const next = current.filter((row) => !write.dropVersions.includes(row.version)).map((row) => row.version === write.markCheckpoint ? { ...row, checkpoint: true } : row)
      next.push(write.row)
      rows.set(kind, next)
      chunks.set(key(kind, write.row.version), write.chunks)
      for (const version of write.dropVersions) chunks.delete(key(kind, version))
      return true
    },
  }
}
