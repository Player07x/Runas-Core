import { parseSnapshotStats } from "../snapshot-policy"
import type { BackupCommit, BackupEncoding, BackupKind, BackupRow, BackupStore, LegacyInfo } from "./versioned-backup"

/**
 * `BackupStore` sobre o D1, com SQL "cru" (como o Runas Book) porque os blocos
 * são BLOB e o Drizzle não agrega nada aqui. As tabelas são criadas na primeira
 * utilização — mesmo precedente de `book_workspace_chunks` — para que a
 * publicação não dependa de uma migração aplicada antes. As tabelas antigas
 * (`knowledge_snapshots`, `backup_snapshots`) continuam somente para leitura.
 */

/** Só estes nomes entram em SQL: nunca vêm de fora. */
const LEGACY_TABLES: Record<BackupKind, string> = { knowledge: "knowledge_snapshots", bestiary: "backup_snapshots" }
const LEGACY_ID = "primary"

export const BACKUP_TABLES_DDL = [
  "CREATE TABLE IF NOT EXISTS cloud_backups (kind TEXT NOT NULL, version INTEGER NOT NULL, created_at INTEGER NOT NULL, device_id TEXT NOT NULL DEFAULT '', base_version INTEGER NOT NULL DEFAULT 0, encoding TEXT NOT NULL DEFAULT 'identity', bytes INTEGER NOT NULL, chunk_count INTEGER NOT NULL, stats TEXT NOT NULL DEFAULT 'null', checkpoint INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, version))",
  "CREATE TABLE IF NOT EXISTS cloud_backup_chunks (kind TEXT NOT NULL, version INTEGER NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (kind, version, idx))",
]

interface RowRecord {
  version: number
  created_at: number
  device_id: string
  base_version: number
  encoding: string
  bytes: number
  chunk_count: number
  stats: string
  checkpoint: number
}

/** O D1 devolve BLOB como ArrayBuffer ou como lista de números, conforme a versão do runtime. */
function toBytes(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (Array.isArray(value)) return Uint8Array.from(value as number[])
  return new Uint8Array(0)
}

function toRow(kind: BackupKind, record: RowRecord): BackupRow {
  return {
    kind,
    version: record.version,
    createdAt: record.created_at,
    deviceId: record.device_id,
    baseVersion: record.base_version,
    encoding: (record.encoding === "gzip" ? "gzip" : "identity") satisfies BackupEncoding,
    bytes: record.bytes,
    chunkCount: record.chunk_count,
    stats: parseSnapshotStats(record.stats),
    checkpoint: record.checkpoint === 1,
  }
}

let tablesReady = false

export async function ensureBackupTables(d1: D1Database): Promise<void> {
  if (tablesReady) return
  // Uma instrução por vez com `.run()`, exatamente como o Runas Book cria `book_workspace_chunks` em produção.
  for (const statement of BACKUP_TABLES_DDL) await d1.prepare(statement).run()
  tablesReady = true
}

/** Só para os testes, que criam um banco novo a cada caso. */
export function resetBackupTablesCache(): void {
  tablesReady = false
}

export function createD1BackupStore(d1: D1Database): BackupStore {
  return {
    async rows(kind) {
      await ensureBackupTables(d1)
      const { results } = await d1.prepare("SELECT version, created_at, device_id, base_version, encoding, bytes, chunk_count, stats, checkpoint FROM cloud_backups WHERE kind = ? ORDER BY version DESC").bind(kind).all<RowRecord>()
      return results.map((record) => toRow(kind, record))
    },

    async chunks(kind, version) {
      await ensureBackupTables(d1)
      const { results } = await d1.prepare("SELECT data FROM cloud_backup_chunks WHERE kind = ? AND version = ? ORDER BY idx").bind(kind, version).all<{ data: unknown }>()
      return results.map((record) => toBytes(record.data))
    },

    async legacyInfo(kind): Promise<LegacyInfo | null> {
      try {
        const record = await d1.prepare(`SELECT updated_at, length(payload) AS bytes FROM ${LEGACY_TABLES[kind]} WHERE id = ? LIMIT 1`).bind(LEGACY_ID).first<{ updated_at: number; bytes: number }>()
        return record ? { updatedAt: record.updated_at, bytes: record.bytes } : null
      } catch {
        // A tabela antiga pode nem existir num banco novo: simplesmente não há legado.
        return null
      }
    },

    async legacyPayload(kind) {
      try {
        const record = await d1.prepare(`SELECT payload FROM ${LEGACY_TABLES[kind]} WHERE id = ? LIMIT 1`).bind(LEGACY_ID).first<{ payload: string }>()
        return record?.payload ?? null
      } catch {
        return null
      }
    },

    async commit(kind, write: BackupCommit) {
      await ensureBackupTables(d1)
      const { row } = write
      const statements = [
        d1.prepare("INSERT INTO cloud_backups (kind, version, created_at, device_id, base_version, encoding, bytes, chunk_count, stats, checkpoint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)")
          .bind(kind, row.version, row.createdAt, row.deviceId, row.baseVersion, row.encoding, row.bytes, row.chunkCount, JSON.stringify(row.stats)),
        ...write.chunks.map((chunk, index) => d1.prepare("INSERT INTO cloud_backup_chunks (kind, version, idx, data) VALUES (?, ?, ?, ?)").bind(kind, row.version, index, chunk)),
      ]
      if (write.markCheckpoint !== null) statements.push(d1.prepare("UPDATE cloud_backups SET checkpoint = 1 WHERE kind = ? AND version = ?").bind(kind, write.markCheckpoint))
      for (const version of write.dropVersions) {
        statements.push(d1.prepare("DELETE FROM cloud_backup_chunks WHERE kind = ? AND version = ?").bind(kind, version))
        statements.push(d1.prepare("DELETE FROM cloud_backups WHERE kind = ? AND version = ?").bind(kind, version))
      }
      try {
        await d1.batch(statements)
        return true
      } catch (error) {
        // Chave primária repetida = outra gravação criou esta versão antes; o lote inteiro foi desfeito.
        if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) return false
        throw error
      }
    },
  }
}
