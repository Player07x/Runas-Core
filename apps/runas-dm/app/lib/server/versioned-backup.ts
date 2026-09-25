import { CLOUD_CHECKPOINT_POLICY, checkpointsToDrop, isShrink, shouldCheckpoint, type CheckpointPolicy, type SnapshotStats } from "../snapshot-policy"

/**
 * Backup versionado do Runas DM no D1. Só há dois tipos de dado na nuvem:
 * `knowledge` (Campanhas + Wiki) e `bestiary` (fichas + tabelas de maestria).
 *
 * Regras (ver `docs/data-sync.md`):
 * - o servidor nunca lê o conteúdo: guarda os bytes que o cliente enviou
 *   (normalmente gzip), em blocos que cabem no limite de linha do D1;
 * - uma gravação só vence se o cliente declara a versão que conhece
 *   (`baseVersion`) e ela é a atual — um dispositivo novo nunca sobrescreve;
 * - gravação que esvazia ou encolhe demais é recusada, salvo `force`;
 * - a versão substituída vira checkpoint de tempos em tempos e sempre que a
 *   gravação é forçada; o resto do histórico é limitado.
 */

export type BackupKind = "knowledge" | "bestiary"
export type BackupEncoding = "gzip" | "identity"

/** Blocos abaixo do limite de ~2 MB por linha do D1, com folga (mesmo valor do Runas Book). */
export const BACKUP_CHUNK_BYTES = 900_000
export const BACKUP_MAX_BYTES = 32_000_000
/** A linha antiga (`knowledge_snapshots` / `backup_snapshots`) é a "versão 1 virtual"; a primeira gravação real é a 2. */
export const LEGACY_VERSION = 1

export interface BackupRow {
  kind: BackupKind
  version: number
  createdAt: number
  deviceId: string
  baseVersion: number
  encoding: BackupEncoding
  bytes: number
  chunkCount: number
  stats: SnapshotStats | null
  checkpoint: boolean
}

export interface LegacyInfo {
  updatedAt: number
  bytes: number
}

export interface BackupCommit {
  row: BackupRow
  chunks: Uint8Array[]
  /** Versão anterior a marcar como checkpoint, quando ela deve ser guardada. */
  markCheckpoint: number | null
  /** Versões (cabeçalho + blocos) a apagar no mesmo passo. */
  dropVersions: number[]
}

export interface BackupStore {
  /** Cabeçalhos de todas as versões reais do tipo, da mais nova para a mais antiga. */
  rows(kind: BackupKind): Promise<BackupRow[]>
  chunks(kind: BackupKind, version: number): Promise<Uint8Array[]>
  legacyInfo(kind: BackupKind): Promise<LegacyInfo | null>
  legacyPayload(kind: BackupKind): Promise<string | null>
  /** Grava e apaga atomicamente. `false` quando a versão já existe (outra gravação chegou primeiro). */
  commit(kind: BackupKind, write: BackupCommit): Promise<boolean>
}

/** O que os clientes veem de uma versão. */
export interface BackupHead {
  version: number
  updatedAt: number
  stats: SnapshotStats | null
  legacy: boolean
  deviceId: string
  baseVersion: number
  bytes: number
  encoding: BackupEncoding
  checkpoint: boolean
}

function toHead(row: BackupRow): BackupHead {
  return { version: row.version, updatedAt: row.createdAt, stats: row.stats, legacy: false, deviceId: row.deviceId, baseVersion: row.baseVersion, bytes: row.bytes, encoding: row.encoding, checkpoint: row.checkpoint }
}

function legacyHead(info: LegacyInfo): BackupHead {
  return { version: LEGACY_VERSION, updatedAt: info.updatedAt, stats: null, legacy: true, deviceId: "", baseVersion: 0, bytes: info.bytes, encoding: "identity", checkpoint: false }
}

export function splitChunks(bytes: Uint8Array, size = BACKUP_CHUNK_BYTES): Uint8Array[] {
  const chunks: Uint8Array[] = []
  for (let offset = 0; offset < bytes.byteLength; offset += size) chunks.push(bytes.slice(offset, offset + size))
  return chunks
}

export function joinChunks(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
  return joined
}

export async function readHead(store: BackupStore, kind: BackupKind): Promise<BackupHead | null> {
  const [row] = await store.rows(kind)
  if (row) return toHead(row)
  const legacy = await store.legacyInfo(kind)
  return legacy ? legacyHead(legacy) : null
}

/** Cabeça + lista de versões disponíveis; a linha antiga aparece como versão 1 enquanto nenhuma versão real a ocupa. */
export async function listBackupMeta(store: BackupStore, kind: BackupKind): Promise<{ head: BackupHead | null; versions: BackupHead[] }> {
  const rows = await store.rows(kind)
  const versions = rows.map(toHead)
  const legacy = await store.legacyInfo(kind)
  if (legacy && !rows.some((row) => row.version === LEGACY_VERSION)) versions.push(legacyHead(legacy))
  return { head: versions[0] ?? null, versions }
}

export async function readBackup(store: BackupStore, kind: BackupKind, version?: number): Promise<{ head: BackupHead; body: Uint8Array<ArrayBuffer> } | null> {
  const rows = await store.rows(kind)
  const row = version === undefined ? rows[0] : rows.find((candidate) => candidate.version === version)
  if (row) return { head: toHead(row), body: joinChunks(await store.chunks(kind, row.version)) }
  if (version === undefined ? rows.length === 0 : version === LEGACY_VERSION) {
    const [info, payload] = await Promise.all([store.legacyInfo(kind), store.legacyPayload(kind)])
    if (info && payload !== null) return { head: legacyHead(info), body: new TextEncoder().encode(payload) }
  }
  return null
}

export interface PutInput {
  body: Uint8Array
  encoding: BackupEncoding
  /** Versão que o cliente diz conhecer; `null` = não informou (cliente antigo ou dispositivo novo). */
  baseVersion: number | null
  stats: SnapshotStats | null
  deviceId: string
  force: boolean
  now: number
}

export type PutResult =
  | { ok: true; version: number; updatedAt: number }
  | { ok: false; status: 400 | 409 | 413; reason: "empty" | "too-large" | "stale" | "shrink"; head: BackupHead | null }

export async function putBackup(store: BackupStore, kind: BackupKind, input: PutInput, policy: CheckpointPolicy = CLOUD_CHECKPOINT_POLICY): Promise<PutResult> {
  if (input.body.byteLength === 0) return { ok: false, status: 400, reason: "empty", head: null }
  if (input.body.byteLength > BACKUP_MAX_BYTES) return { ok: false, status: 413, reason: "too-large", head: null }

  const rows = await store.rows(kind)
  const previous = rows[0] ?? null
  const legacy = previous ? null : await store.legacyInfo(kind)
  const head = previous ? toHead(previous) : legacy ? legacyHead(legacy) : null
  const shrink = isShrink(head?.stats, input.stats)

  if (head && !input.force) {
    if (input.baseVersion !== head.version) return { ok: false, status: 409, reason: "stale", head }
    if (shrink) return { ok: false, status: 409, reason: "shrink", head }
  }

  const version = head ? head.version + 1 : 1
  const newestCheckpoint = rows.find((row) => row.checkpoint)
  const keepPrevious = previous !== null && shouldCheckpoint({ previousAt: previous.createdAt, newestCheckpointAt: newestCheckpoint?.createdAt ?? null, forced: input.force, shrink, policy })
  const kept = rows.filter((row) => row.checkpoint).map((row) => ({ at: row.createdAt, version: row.version }))
  if (previous && keepPrevious) kept.push({ at: previous.createdAt, version: previous.version })
  const dropVersions = checkpointsToDrop(kept, policy.keep).map((item) => item.version)
  if (previous && !keepPrevious) dropVersions.push(previous.version)

  const chunks = splitChunks(input.body)
  const row: BackupRow = { kind, version, createdAt: input.now, deviceId: input.deviceId, baseVersion: input.baseVersion ?? 0, encoding: input.encoding, bytes: input.body.byteLength, chunkCount: chunks.length, stats: input.stats, checkpoint: false }
  const committed = await store.commit(kind, { row, chunks, markCheckpoint: previous && keepPrevious ? previous.version : null, dropVersions })
  if (!committed) return { ok: false, status: 409, reason: "stale", head: await readHead(store, kind) }
  return { ok: true, version, updatedAt: input.now }
}
