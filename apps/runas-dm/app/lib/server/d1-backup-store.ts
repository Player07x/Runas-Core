import { parseSnapshotStats } from "../snapshot-policy"
import { DEFAULT_COLLECTION_ID, type BackupCommit, type BackupEncoding, type BackupKind, type BackupRow, type BackupStore, type LegacyInfo } from "./versioned-backup"

/**
 * `BackupStore` sobre o D1, com SQL "cru" (como o Runas Book) porque os blocos
 * são BLOB e o Drizzle não agrega nada aqui. As tabelas são criadas na primeira
 * utilização — mesmo precedente de `book_workspace_chunks` — para que a
 * publicação não dependa de uma migração aplicada antes. As tabelas antigas
 * (`knowledge_snapshots`, `backup_snapshots`) continuam somente para leitura.
 *
 * Coleções múltiplas (vários bestiários, várias wikis) acrescentaram
 * `collection_id` à chave de `cloud_backups`/`cloud_backup_chunks`. Um banco
 * que já tinha essas tabelas no formato antigo (chave `(kind, version)`, uma
 * única coleção por token) é migrado sozinho na primeira requisição depois do
 * deploy: a tabela antiga é **renomeada**, nunca apagada — mesmo tratamento
 * que o projeto já dá a `knowledge_snapshots`/`backup_snapshots` ("versão 1
 * virtual", nunca descartada) — e todo o conteúdo dela entra na coleção
 * `DEFAULT_COLLECTION_ID`, que é exatamente o bestiário/wiki que já existia.
 */

/** Só estes nomes entram em SQL: nunca vêm de fora. */
const LEGACY_TABLES: Record<BackupKind, string> = { knowledge: "knowledge_snapshots", bestiary: "backup_snapshots" }
const LEGACY_ID = "primary"
/** Nome das tabelas antigas (chave sem `collection_id`) depois de renomeadas pela migração; nunca apagadas. */
const PRE_COLLECTION_BACKUPS_TABLE = "cloud_backups_v1_legacy"
const PRE_COLLECTION_CHUNKS_TABLE = "cloud_backup_chunks_v1_legacy"

export const BACKUP_TABLES_DDL = [
  "CREATE TABLE IF NOT EXISTS cloud_backups (kind TEXT NOT NULL, collection_id TEXT NOT NULL DEFAULT 'default', version INTEGER NOT NULL, created_at INTEGER NOT NULL, device_id TEXT NOT NULL DEFAULT '', base_version INTEGER NOT NULL DEFAULT 0, encoding TEXT NOT NULL DEFAULT 'identity', bytes INTEGER NOT NULL, chunk_count INTEGER NOT NULL, stats TEXT NOT NULL DEFAULT 'null', checkpoint INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, collection_id, version))",
  "CREATE TABLE IF NOT EXISTS cloud_backup_chunks (kind TEXT NOT NULL, collection_id TEXT NOT NULL DEFAULT 'default', version INTEGER NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (kind, collection_id, version, idx))",
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

function toRow(kind: BackupKind, collectionId: string, record: RowRecord): BackupRow {
  return {
    kind,
    collectionId,
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

async function tableExists(d1: D1Database, table: string): Promise<boolean> {
  const record = await d1.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first<{ name: string }>()
  return Boolean(record)
}

async function hasColumn(d1: D1Database, table: string, column: string): Promise<boolean> {
  const { results } = await d1.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
  return results.some((info) => info.name === column)
}

/**
 * Migra as duas tabelas do formato antigo (`PRIMARY KEY (kind, version)`,
 * uma única coleção por token) para o novo (`collection_id` na chave), sem
 * apagar nada. Idempotente: uma vez migrada, `hasColumn` já vê `collection_id`
 * e a função não faz mais nada. Roda antes de `BACKUP_TABLES_DDL`, porque um
 * `CREATE TABLE IF NOT EXISTS` não alteraria uma tabela que já existe no
 * formato antigo.
 */
async function migrateToCollectionSchema(d1: D1Database): Promise<void> {
  const oldBackups = await tableExists(d1, "cloud_backups") && !await hasColumn(d1, "cloud_backups", "collection_id")
  if (oldBackups) await d1.prepare(`ALTER TABLE cloud_backups RENAME TO ${PRE_COLLECTION_BACKUPS_TABLE}`).run()

  const oldChunks = await tableExists(d1, "cloud_backup_chunks") && !await hasColumn(d1, "cloud_backup_chunks", "collection_id")
  if (oldChunks) await d1.prepare(`ALTER TABLE cloud_backup_chunks RENAME TO ${PRE_COLLECTION_CHUNKS_TABLE}`).run()

  for (const statement of BACKUP_TABLES_DDL) await d1.prepare(statement).run()

  if (oldBackups) {
    await d1.prepare(
      `INSERT INTO cloud_backups (kind, collection_id, version, created_at, device_id, base_version, encoding, bytes, chunk_count, stats, checkpoint)
       SELECT kind, ?, version, created_at, device_id, base_version, encoding, bytes, chunk_count, stats, checkpoint FROM ${PRE_COLLECTION_BACKUPS_TABLE}`,
    ).bind(DEFAULT_COLLECTION_ID).run()
  }
  if (oldChunks) {
    await d1.prepare(
      `INSERT INTO cloud_backup_chunks (kind, collection_id, version, idx, data)
       SELECT kind, ?, version, idx, data FROM ${PRE_COLLECTION_CHUNKS_TABLE}`,
    ).bind(DEFAULT_COLLECTION_ID).run()
  }
}

let tablesReady = false

export async function ensureBackupTables(d1: D1Database): Promise<void> {
  if (tablesReady) return
  await migrateToCollectionSchema(d1)
  tablesReady = true
}

/** Só para os testes, que criam um banco novo a cada caso. */
export function resetBackupTablesCache(): void {
  tablesReady = false
}

export function createD1BackupStore(d1: D1Database): BackupStore {
  return {
    async rows(kind, collectionId) {
      await ensureBackupTables(d1)
      const { results } = await d1.prepare("SELECT version, created_at, device_id, base_version, encoding, bytes, chunk_count, stats, checkpoint FROM cloud_backups WHERE kind = ? AND collection_id = ? ORDER BY version DESC").bind(kind, collectionId).all<RowRecord>()
      return results.map((record) => toRow(kind, collectionId, record))
    },

    async chunks(kind, collectionId, version) {
      await ensureBackupTables(d1)
      const { results } = await d1.prepare("SELECT data FROM cloud_backup_chunks WHERE kind = ? AND collection_id = ? AND version = ? ORDER BY idx").bind(kind, collectionId, version).all<{ data: unknown }>()
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

    async commit(kind, collectionId, write: BackupCommit) {
      await ensureBackupTables(d1)
      const { row } = write
      const statements = [
        d1.prepare("INSERT INTO cloud_backups (kind, collection_id, version, created_at, device_id, base_version, encoding, bytes, chunk_count, stats, checkpoint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)")
          .bind(kind, collectionId, row.version, row.createdAt, row.deviceId, row.baseVersion, row.encoding, row.bytes, row.chunkCount, JSON.stringify(row.stats)),
        ...write.chunks.map((chunk, index) => d1.prepare("INSERT INTO cloud_backup_chunks (kind, collection_id, version, idx, data) VALUES (?, ?, ?, ?, ?)").bind(kind, collectionId, row.version, index, chunk)),
      ]
      if (write.markCheckpoint !== null) statements.push(d1.prepare("UPDATE cloud_backups SET checkpoint = 1 WHERE kind = ? AND collection_id = ? AND version = ?").bind(kind, collectionId, write.markCheckpoint))
      for (const version of write.dropVersions) {
        statements.push(d1.prepare("DELETE FROM cloud_backup_chunks WHERE kind = ? AND collection_id = ? AND version = ?").bind(kind, collectionId, version))
        statements.push(d1.prepare("DELETE FROM cloud_backups WHERE kind = ? AND collection_id = ? AND version = ?").bind(kind, collectionId, version))
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
