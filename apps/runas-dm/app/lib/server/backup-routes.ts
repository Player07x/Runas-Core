import { parseSnapshotStats } from "../snapshot-policy"
import { BACKUP_MAX_BYTES, listBackupMeta, putBackup, readBackup, type BackupHead, type BackupKind, type BackupStore } from "./versioned-backup"

/**
 * Camada HTTP do backup na nuvem, sem nada específico do Cloudflare para poder
 * ser testada: quem monta as dependências (`cloudflare-backup-handlers.ts`)
 * injeta a verificação do token e o acesso ao D1.
 *
 * Contrato (as duas rotas, `/api/backup` e `/api/campaign-data`):
 * - `GET`            → bytes da versão mais recente (cabeçalhos `X-Runas-*`) ou `{ head: null }`;
 * - `GET ?meta=1`    → `{ head, versions }`;
 * - `GET ?version=N` → bytes daquela versão;
 * - `PUT`            → corpo = bytes (gzip do cliente); `X-Runas-Base-Version` é a versão que o
 *                      cliente conhece; `409 { reason: "stale" | "shrink", head }` quando a
 *                      gravação sobrescreveria algo que ele não viu.
 */

export interface BackupRouteDeps {
  verifyBearer(request: Request): Promise<boolean>
  openStore(): Promise<BackupStore | null>
  now(): number
}

const NO_STORE = { "Cache-Control": "no-store" }

const MESSAGES = {
  stale: "A nuvem tem uma versão que este dispositivo ainda não recebeu. Nada foi sobrescrito.",
  shrink: "Este envio removeria dados demais da nuvem. Nada foi sobrescrito.",
  "too-large": `O backup passa do limite de ${BACKUP_MAX_BYTES / 1_000_000} MB.`,
  empty: "O backup enviado está vazio.",
} as const

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE })
}

/** O preview em localhost nunca toca o D1 (Campanhas/Wiki continuam locais e offline-first). */
function isLocalRequest(request: Request): boolean {
  const { hostname } = new URL(request.url)
  return hostname === "localhost" || hostname === "127.0.0.1"
}

function headHeaders(head: BackupHead): Record<string, string> {
  return {
    "Content-Type": "application/octet-stream",
    ...NO_STORE,
    "X-Runas-Version": String(head.version),
    "X-Runas-Updated-At": String(head.updatedAt),
    "X-Runas-Encoding": head.encoding,
    "X-Runas-Legacy": head.legacy ? "1" : "0",
    "X-Runas-Device": head.deviceId,
    "X-Runas-Base-Version": String(head.baseVersion),
    ...(head.stats ? { "X-Runas-Stats": JSON.stringify(head.stats) } : {}),
  }
}

function failure(error: unknown, action: string): Response {
  const detail = error instanceof Error ? error.message.slice(0, 200) : ""
  return json({ error: `Falha ao ${action} o backup na nuvem.`, detail }, 500)
}

export function createBackupHandlers(deps: BackupRouteDeps) {
  async function get(request: Request, kind: BackupKind): Promise<Response> {
    if (kind === "knowledge" && isLocalRequest(request)) return json({ head: null, localOnly: true })
    if (!await deps.verifyBearer(request)) return json({ error: "Não autorizado." }, 401)
    const store = await deps.openStore()
    if (!store) return json({ error: "O banco de dados da nuvem não está disponível neste ambiente." }, 503)
    const url = new URL(request.url)
    try {
      if (url.searchParams.get("meta") === "1") return json(await listBackupMeta(store, kind))
      const versionParam = url.searchParams.get("version")
      if (versionParam !== null && !/^\d+$/.test(versionParam)) return json({ error: "Versão inválida." }, 400)
      const found = await readBackup(store, kind, versionParam === null ? undefined : Number(versionParam))
      if (!found) return json({ head: null })
      return new Response(found.body, { headers: headHeaders(found.head) })
    } catch (error) {
      return failure(error, "ler")
    }
  }

  async function put(request: Request, kind: BackupKind): Promise<Response> {
    if (kind === "knowledge" && isLocalRequest(request)) return json({ ok: true, version: 0, updatedAt: deps.now(), localOnly: true })
    if (!await deps.verifyBearer(request)) return json({ error: "Não autorizado." }, 401)
    const declared = Number(request.headers.get("content-length") ?? 0)
    if (declared > BACKUP_MAX_BYTES) return json({ error: MESSAGES["too-large"], reason: "too-large", limitBytes: BACKUP_MAX_BYTES }, 413)
    const store = await deps.openStore()
    if (!store) return json({ error: "O banco de dados da nuvem não está disponível neste ambiente." }, 503)
    try {
      const baseHeader = request.headers.get("x-runas-base-version")
      const result = await putBackup(store, kind, {
        body: new Uint8Array(await request.arrayBuffer()),
        encoding: request.headers.get("x-runas-encoding") === "gzip" ? "gzip" : "identity",
        baseVersion: baseHeader !== null && /^\d+$/.test(baseHeader) ? Number(baseHeader) : null,
        stats: parseSnapshotStats(request.headers.get("x-runas-stats")),
        deviceId: (request.headers.get("x-runas-device") ?? "").replace(/[^\w.-]/g, "").slice(0, 64),
        force: request.headers.get("x-runas-force") === "1",
        now: deps.now(),
      })
      if (result.ok) return json({ ok: true, version: result.version, updatedAt: result.updatedAt })
      return json({ error: MESSAGES[result.reason], reason: result.reason, head: result.head, ...(result.reason === "too-large" ? { limitBytes: BACKUP_MAX_BYTES } : {}) }, result.status)
    } catch (error) {
      return failure(error, "gravar")
    }
  }

  return { get, put }
}
