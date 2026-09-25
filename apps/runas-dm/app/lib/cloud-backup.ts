import { createId } from "@runas/core/lib/ids"
import type { BackupHead } from "./server/versioned-backup"
import { describeStats, hashText, type SnapshotStats } from "./snapshot-policy"

export { hashText }

/**
 * Cliente do backup na nuvem (Bestiário e Campanhas/Wiki). Regras:
 *
 * - o payload viaja comprimido (gzip) e em um único envio; o servidor o guarda
 *   em blocos, então o limite de linha do D1 deixa de existir para o usuário;
 * - todo envio declara a **versão-base** que este dispositivo conhece. Sem ela
 *   (dispositivo novo) ou com uma antiga, o servidor recusa com `stale` em vez
 *   de sobrescrever — foi assim que um computador novo apagou um backup bom;
 * - nenhum erro vira silêncio: o resultado sempre diz o que aconteceu.
 */

export type CloudKind = "knowledge" | "bestiary"
export type CloudHead = BackupHead

export const CLOUD_PATHS: Record<CloudKind, string> = { knowledge: "/api/campaign-data", bestiary: "/api/backup" }
export const BACKUP_TOKEN_KEY = "runas-dm.backup-token"
const DEVICE_KEY = "runas-dm.device-id"
const baseKey = (kind: CloudKind) => `runas-dm.cloud-base.${kind}`

function local(): Storage | null {
  try { return globalThis.localStorage ?? null } catch { return null }
}

function session(): Storage | null {
  try { return globalThis.sessionStorage ?? null } catch { return null }
}

// ---- token (só nesta aba; nunca em disco, IndexedDB, bundle ou Git) ----

export function readBackupToken(): string {
  try { return session()?.getItem(BACKUP_TOKEN_KEY) ?? "" } catch { return "" }
}

export function saveBackupToken(token: string): void {
  try { session()?.setItem(BACKUP_TOKEN_KEY, token) } catch { /* sem armazenamento de sessão: o token vale só para esta chamada */ }
}

export function clearBackupToken(): void {
  try { session()?.removeItem(BACKUP_TOKEN_KEY) } catch { /* nada a limpar */ }
}

// ---- identidade e versão-base deste dispositivo ----

/** Identifica este navegador nas cópias que ele grava; não é segredo. */
export function getDeviceId(): string {
  try {
    const store = local()
    const existing = store?.getItem(DEVICE_KEY)
    if (existing) return existing
    const created = createId()
    store?.setItem(DEVICE_KEY, created)
    return created
  } catch {
    return "dispositivo-sem-armazenamento"
  }
}

/** Última versão da nuvem que este dispositivo enviou ou importou; `null` = nunca sincronizou. */
export function readCloudBase(kind: CloudKind): number | null {
  try {
    const raw = local()?.getItem(baseKey(kind))
    return raw !== null && raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}

export function writeCloudBase(kind: CloudKind, version: number): void {
  try { local()?.setItem(baseKey(kind), String(version)) } catch { /* a próxima sincronização volta a perguntar */ }
}

const signatureKey = (kind: CloudKind) => `runas-dm.cloud-signature.${kind}`

/** Hash do conteúdo que este dispositivo enviou (ou recebeu) por último; evita reenviar o que não mudou. */
export function readCloudSignature(kind: CloudKind): string | null {
  try { return local()?.getItem(signatureKey(kind)) ?? null } catch { return null }
}

export function writeCloudSignature(kind: CloudKind, signature: string): void {
  try { local()?.setItem(signatureKey(kind), signature) } catch { /* no máximo um envio a mais */ }
}

// ---- compressão ----

export async function gzipText(text: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; encoding: "gzip" | "identity" }> {
  if (typeof CompressionStream === "undefined") return { bytes: new TextEncoder().encode(text), encoding: "identity" }
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), encoding: "gzip" }
}

export async function decodeBackupBytes(bytes: ArrayBuffer, encoding: string): Promise<string> {
  if (encoding !== "gzip") return new TextDecoder().decode(bytes)
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
}

// ---- resultados ----

export type CloudPutResult =
  | { ok: true; version: number; updatedAt: number; localOnly: boolean }
  | { ok: false; reason: "stale" | "shrink"; head: CloudHead | null; message: string }
  | { ok: false; reason: "unauthorized"; message: string }
  | { ok: false; reason: "too-large"; message: string; limitBytes: number }
  | { ok: false; reason: "unavailable"; message: string }

export type CloudMetaResult =
  | { ok: true; head: CloudHead | null; versions: CloudHead[]; localOnly: boolean }
  | { ok: false; reason: "unauthorized" | "unavailable"; message: string }

export type CloudReadResult<T> =
  | { ok: true; empty: false; head: CloudHead; data: T }
  | { ok: true; empty: true; localOnly: boolean }
  | { ok: false; reason: "unauthorized" | "unavailable"; message: string }

const UNAUTHORIZED = "Token de backup inválido."
const OFFLINE = "Sem conexão com a nuvem."

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json()
    return body && typeof body === "object" ? body as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function serverMessage(body: Record<string, unknown>, fallback: string): string {
  const message = typeof body.error === "string" ? body.error : fallback
  return typeof body.detail === "string" && body.detail ? `${message} (${body.detail})` : message
}

function headFromHeaders(headers: Headers): CloudHead {
  const number = (name: string) => Number(headers.get(name) ?? 0) || 0
  let stats: SnapshotStats | null = null
  try {
    const raw = headers.get("x-runas-stats")
    stats = raw ? JSON.parse(raw) as SnapshotStats : null
  } catch { stats = null }
  return {
    version: number("x-runas-version"),
    updatedAt: number("x-runas-updated-at"),
    stats,
    legacy: headers.get("x-runas-legacy") === "1",
    deviceId: headers.get("x-runas-device") ?? "",
    baseVersion: number("x-runas-base-version"),
    bytes: number("content-length"),
    encoding: headers.get("x-runas-encoding") === "gzip" ? "gzip" : "identity",
    checkpoint: false,
  }
}

/**
 * Envia uma cópia inteira. `force` só existe para o botão explícito "Substituir
 * a nuvem por este dispositivo" (o servidor guarda a versão anterior).
 */
export async function putCloudBackup(kind: CloudKind, token: string, input: { payload: unknown; stats: SnapshotStats; force?: boolean }, retried = false): Promise<CloudPutResult> {
  const { bytes, encoding } = await gzipText(JSON.stringify(input.payload))
  const base = readCloudBase(kind)
  const device = getDeviceId()
  const headers: Record<string, string> = { "Content-Type": "application/octet-stream", authorization: `Bearer ${token}`, "x-runas-encoding": encoding, "x-runas-stats": JSON.stringify(input.stats), "x-runas-device": device }
  if (base !== null) headers["x-runas-base-version"] = String(base)
  if (input.force) headers["x-runas-force"] = "1"

  let response: Response
  try {
    response = await fetch(CLOUD_PATHS[kind], { method: "PUT", headers, body: bytes })
  } catch {
    return { ok: false, reason: "unavailable", message: OFFLINE }
  }
  const body = await readJson(response)
  if (response.ok) {
    const version = typeof body.version === "number" ? body.version : 0
    const localOnly = body.localOnly === true
    if (!localOnly) writeCloudBase(kind, version)
    return { ok: true, version, updatedAt: typeof body.updatedAt === "number" ? body.updatedAt : Date.now(), localOnly }
  }
  if (response.status === 401) return { ok: false, reason: "unauthorized", message: UNAUTHORIZED }
  if (response.status === 413) return { ok: false, reason: "too-large", message: serverMessage(body, "O backup é grande demais para a nuvem."), limitBytes: typeof body.limitBytes === "number" ? body.limitBytes : 0 }
  if (response.status === 409 && (body.reason === "stale" || body.reason === "shrink")) {
    const head = (body.head ?? null) as CloudHead | null
    // Nossa gravação anterior chegou ao servidor mas a resposta se perdeu: a cabeça é obra deste
    // dispositivo, a partir da nossa base. Adotamos a versão e repetimos uma vez, com o estado atual.
    if (!retried && body.reason === "stale" && head && head.deviceId === device && head.baseVersion === (base ?? 0) && head.version === (base ?? 0) + 1) {
      writeCloudBase(kind, head.version)
      return putCloudBackup(kind, token, input, true)
    }
    return { ok: false, reason: body.reason, head, message: serverMessage(body, "A nuvem recusou o envio.") }
  }
  return { ok: false, reason: "unavailable", message: serverMessage(body, `A nuvem respondeu com erro ${response.status}.`) }
}

export async function fetchCloudMeta(kind: CloudKind, token: string): Promise<CloudMetaResult> {
  let response: Response
  try {
    response = await fetch(`${CLOUD_PATHS[kind]}?meta=1`, { cache: "no-store", headers: { authorization: `Bearer ${token}` } })
  } catch {
    return { ok: false, reason: "unavailable", message: OFFLINE }
  }
  if (response.status === 401) return { ok: false, reason: "unauthorized", message: UNAUTHORIZED }
  const body = await readJson(response)
  if (!response.ok) return { ok: false, reason: "unavailable", message: serverMessage(body, `A nuvem respondeu com erro ${response.status}.`) }
  return { ok: true, head: (body.head ?? null) as CloudHead | null, versions: Array.isArray(body.versions) ? body.versions as CloudHead[] : [], localOnly: body.localOnly === true }
}

/** Lê a versão mais recente (ou uma específica). Quem aplica o resultado grava a versão-base com `writeCloudBase`. */
export async function fetchCloudBackup<T>(kind: CloudKind, token: string, version?: number): Promise<CloudReadResult<T>> {
  let response: Response
  try {
    response = await fetch(`${CLOUD_PATHS[kind]}${version === undefined ? "" : `?version=${version}`}`, { cache: "no-store", headers: { authorization: `Bearer ${token}` } })
  } catch {
    return { ok: false, reason: "unavailable", message: OFFLINE }
  }
  if (response.status === 401) return { ok: false, reason: "unauthorized", message: UNAUTHORIZED }
  if (!response.ok) return { ok: false, reason: "unavailable", message: serverMessage(await readJson(response), `A nuvem respondeu com erro ${response.status}.`) }
  if (response.headers.get("x-runas-version") === null) return { ok: true, empty: true, localOnly: (await readJson(response)).localOnly === true }
  const head = headFromHeaders(response.headers)
  try {
    const data = JSON.parse(await decodeBackupBytes(await response.arrayBuffer(), head.encoding)) as T
    return { ok: true, empty: false, head, data }
  } catch {
    return { ok: false, reason: "unavailable", message: "O backup na nuvem está ilegível." }
  }
}

/** "24/09/2026 15:03 · 812 páginas · 3 campanhas": o que a nuvem já tem, para diálogos e status. */
export function describeCloudHead(head: CloudHead): string {
  return `${new Date(head.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${describeStats(head.stats)}`
}
