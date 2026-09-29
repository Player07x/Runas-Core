import type { BackupCommit, BackupKind, BackupRow, BackupStore } from "./versioned-backup"

/**
 * `BackupStore` em memória, com a mesma semântica do D1: gravação atômica e
 * versão única por (tipo, coleção). Serve aos testes e ao preview local;
 * nunca ao servidor publicado. `legacy` só descreve a coleção padrão, que é
 * a única que já existia antes de coleções múltiplas existirem.
 */
export function createMemoryBackupStore(legacy: Partial<Record<BackupKind, { payload: string; updatedAt: number }>> = {}): BackupStore {
  const rows = new Map<string, BackupRow[]>()
  const chunks = new Map<string, Uint8Array[]>()
  const collectionKey = (kind: BackupKind, collectionId: string) => `${kind}:${collectionId}`
  const versionKey = (kind: BackupKind, collectionId: string, version: number) => `${kind}:${collectionId}:${version}`
  return {
    async rows(kind, collectionId) { return [...(rows.get(collectionKey(kind, collectionId)) ?? [])].sort((left, right) => right.version - left.version) },
    async chunks(kind, collectionId, version) { return chunks.get(versionKey(kind, collectionId, version)) ?? [] },
    async legacyInfo(kind) { const item = legacy[kind]; return item ? { updatedAt: item.updatedAt, bytes: item.payload.length } : null },
    async legacyPayload(kind) { return legacy[kind]?.payload ?? null },
    async commit(kind, collectionId, write: BackupCommit) {
      const key = collectionKey(kind, collectionId)
      const current = rows.get(key) ?? []
      if (current.some((row) => row.version === write.row.version)) return false
      const next = current.filter((row) => !write.dropVersions.includes(row.version)).map((row) => row.version === write.markCheckpoint ? { ...row, checkpoint: true } : row)
      next.push(write.row)
      rows.set(key, next)
      chunks.set(versionKey(kind, collectionId, write.row.version), write.chunks)
      for (const version of write.dropVersions) chunks.delete(versionKey(kind, collectionId, version))
      return true
    },
  }
}
