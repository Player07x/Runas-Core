import { describe, expect, it } from "vitest"
import { createBackupHandlers, type BackupRouteDeps } from "./backup-routes"
import { createMemoryBackupStore } from "./memory-backup-store"
import { BACKUP_MAX_BYTES, type BackupStore } from "./versioned-backup"

const encode = (text: string) => new TextEncoder().encode(text)
const decode = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes)

function setup(overrides: Partial<BackupRouteDeps> = {}) {
  const store = createMemoryBackupStore()
  let clock = 1_000
  const handlers = createBackupHandlers({ verifyBearer: async (request) => request.headers.get("authorization") === "Bearer segredo", openStore: async () => store, now: () => (clock += 1), ...overrides })
  const url = (path: string, host = "runas-dm.pages.dev") => `https://${host}${path}`
  const headers = (extra: Record<string, string> = {}) => ({ authorization: "Bearer segredo", ...extra })
  return { store, handlers, url, headers }
}

describe("rotas de backup na nuvem", () => {
  it("sem o token nada é lido nem gravado", async () => {
    const { handlers, url } = setup()
    expect((await handlers.get(new Request(url("/api/backup")), "bestiary")).status).toBe(401)
    expect((await handlers.put(new Request(url("/api/backup"), { method: "PUT", body: "x" }), "bestiary")).status).toBe(401)
    const wrong = await handlers.put(new Request(url("/api/campaign-data"), { method: "PUT", body: "x", headers: { authorization: "Bearer errado" } }), "knowledge")
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ error: "Não autorizado." })
  })

  it("sem backup, a leitura devolve `head: null` em vez de erro", async () => {
    const { handlers, url, headers } = setup()
    const response = await handlers.get(new Request(url("/api/campaign-data"), { headers: headers() }), "knowledge")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ head: null })
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("grava, lê os mesmos bytes e informa versão, data, codificação e estatísticas nos cabeçalhos", async () => {
    const { handlers, url, headers } = setup()
    const saved = await handlers.put(new Request(url("/api/campaign-data"), { method: "PUT", headers: headers({ "x-runas-encoding": "gzip", "x-runas-stats": '{"total":5,"pages":4,"campaigns":1}', "x-runas-device": "note book/1" }), body: encode("conteúdo") }), "knowledge")
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ ok: true, version: 1, updatedAt: 1_001 })

    const read = await handlers.get(new Request(url("/api/campaign-data"), { headers: headers() }), "knowledge")
    expect(decode(await read.arrayBuffer())).toBe("conteúdo")
    expect(read.headers.get("content-type")).toBe("application/octet-stream")
    expect(read.headers.get("x-runas-version")).toBe("1")
    expect(read.headers.get("x-runas-encoding")).toBe("gzip")
    expect(read.headers.get("x-runas-legacy")).toBe("0")
    expect(read.headers.get("x-runas-device")).toBe("notebook1")
    expect(JSON.parse(read.headers.get("x-runas-stats")!)).toEqual({ total: 5, pages: 4, campaigns: 1 })
  })

  it("um envio sem a versão-base (dispositivo novo) é recusado com 409 e a nuvem fica intacta", async () => {
    const { handlers, url, headers } = setup()
    await handlers.put(new Request(url("/api/campaign-data"), { method: "PUT", headers: headers({ "x-runas-stats": '{"total":812}' }), body: encode("bom") }), "knowledge")
    const blocked = await handlers.put(new Request(url("/api/campaign-data"), { method: "PUT", headers: headers({ "x-runas-stats": '{"total":0}' }), body: encode("{}") }), "knowledge")
    expect(blocked.status).toBe(409)
    const body = await blocked.json() as { error: string; reason: string; head: { version: number; stats: { total: number } } }
    expect(body.reason).toBe("stale")
    expect(body.error).toContain("Nada foi sobrescrito")
    expect(body.head).toMatchObject({ version: 1, stats: { total: 812 } })
    const read = await handlers.get(new Request(url("/api/campaign-data"), { headers: headers() }), "knowledge")
    expect(decode(await read.arrayBuffer())).toBe("bom")
  })

  it("a trava de encolhimento vale mesmo com a base certa, e `X-Runas-Force` a libera", async () => {
    const { handlers, url, headers } = setup()
    await handlers.put(new Request(url("/api/backup"), { method: "PUT", headers: headers({ "x-runas-stats": '{"total":100}' }), body: encode("cheio") }), "bestiary")
    const request = (extra: Record<string, string>) => new Request(url("/api/backup"), { method: "PUT", headers: headers({ "x-runas-base-version": "1", "x-runas-stats": '{"total":10}', ...extra }), body: encode("pouco") })
    const shrink = await handlers.put(request({}), "bestiary")
    expect(shrink.status).toBe(409)
    expect(((await shrink.json()) as { reason: string }).reason).toBe("shrink")
    const forced = await handlers.put(request({ "x-runas-force": "1" }), "bestiary")
    expect(forced.status).toBe(200)
    expect(((await forced.json()) as { version: number }).version).toBe(2)
  })

  it("lista as versões (`?meta=1`) e lê uma versão específica (`?version=N`)", async () => {
    const { handlers, url, headers } = setup()
    await handlers.put(new Request(url("/api/campaign-data"), { method: "PUT", headers: headers(), body: encode("um") }), "knowledge")
    await handlers.put(new Request(url("/api/campaign-data"), { method: "PUT", headers: headers({ "x-runas-base-version": "1" }), body: encode("dois") }), "knowledge")
    const meta = await (await handlers.get(new Request(url("/api/campaign-data?meta=1"), { headers: headers() }), "knowledge")).json() as { head: { version: number }; versions: Array<{ version: number }> }
    expect(meta.head.version).toBe(2)
    expect(meta.versions.map((item) => item.version)).toEqual([2, 1])
    const first = await handlers.get(new Request(url("/api/campaign-data?version=1"), { headers: headers() }), "knowledge")
    expect(decode(await first.arrayBuffer())).toBe("um")
    expect((await handlers.get(new Request(url("/api/campaign-data?version=abc"), { headers: headers() }), "knowledge")).status).toBe(400)
    expect(await (await handlers.get(new Request(url("/api/campaign-data?version=9"), { headers: headers() }), "knowledge")).json()).toEqual({ head: null })
  })

  it("recusa antes de ler o corpo quando o tamanho declarado passa do limite", async () => {
    const { handlers, url } = setup()
    let bodyRead = false
    const request = {
      url: url("/api/campaign-data"),
      method: "PUT",
      headers: new Headers({ authorization: "Bearer segredo", "content-length": String(BACKUP_MAX_BYTES + 1) }),
      arrayBuffer: async () => { bodyRead = true; return new ArrayBuffer(0) },
    } as unknown as Request
    const response = await handlers.put(request, "knowledge")
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ reason: "too-large", limitBytes: BACKUP_MAX_BYTES })
    expect(bodyRead).toBe(false)
  })

  it("Campanhas/Wiki em localhost seguem locais (sem token e sem D1); o Bestiário não abre exceção", async () => {
    let opened = 0
    const { handlers, url } = setup({ openStore: async () => { opened += 1; return null } })
    const get = await handlers.get(new Request(url("/api/campaign-data", "localhost")), "knowledge")
    expect(await get.json()).toEqual({ head: null, localOnly: true })
    const put = await handlers.put(new Request(url("/api/campaign-data", "127.0.0.1"), { method: "PUT", body: "{}" }), "knowledge")
    expect(await put.json()).toMatchObject({ ok: true, localOnly: true })
    expect(opened).toBe(0)
    expect((await handlers.get(new Request(url("/api/backup", "localhost")), "bestiary")).status).toBe(401)
  })

  it("mostra um erro claro quando o banco não existe ou falha, sem derrubar a rota", async () => {
    const missing = setup({ openStore: async () => null })
    const noDb = await missing.handlers.get(new Request(missing.url("/api/backup"), { headers: missing.headers() }), "bestiary")
    expect(noDb.status).toBe(503)

    const broken: BackupStore = { ...createMemoryBackupStore(), rows: async () => { throw new Error("D1_ERROR: no such table: cloud_backups") } }
    const failing = setup({ openStore: async () => broken })
    const response = await failing.handlers.put(new Request(failing.url("/api/backup"), { method: "PUT", headers: failing.headers(), body: encode("x") }), "bestiary")
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ error: "Falha ao gravar o backup na nuvem.", detail: "D1_ERROR: no such table: cloud_backups" })
  })
})
