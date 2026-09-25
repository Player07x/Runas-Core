import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CLOUD_PATHS, clearBackupToken, decodeBackupBytes, describeCloudHead, fetchCloudBackup, fetchCloudMeta, getDeviceId, gzipText, hashText, putCloudBackup, readBackupToken, readCloudBase, readCloudSignature, saveBackupToken, writeCloudBase, writeCloudSignature } from "./cloud-backup"

function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size },
  }
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage())
  vi.stubGlobal("sessionStorage", fakeStorage())
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
})

afterEach(() => vi.unstubAllGlobals())

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const stats = { total: 3, pages: 2, campaigns: 1, tags: 0 }

async function sentPayload(callIndex = 0): Promise<unknown> {
  const init = fetchMock.mock.calls[callIndex][1]!
  const body = init.body as Uint8Array<ArrayBuffer>
  const encoding = (init.headers as Record<string, string>)["x-runas-encoding"]
  return JSON.parse(await decodeBackupBytes(body.buffer, encoding))
}

const requestHeaders = (callIndex = 0) => fetchMock.mock.calls[callIndex][1]!.headers as Record<string, string>

describe("token, dispositivo e versão-base", () => {
  it("o token vive só na sessão desta aba", () => {
    expect(readBackupToken()).toBe("")
    saveBackupToken("segredo")
    expect(readBackupToken()).toBe("segredo")
    expect(localStorage.length).toBe(0)
    clearBackupToken()
    expect(readBackupToken()).toBe("")
  })

  it("o identificador do dispositivo é estável", () => {
    const first = getDeviceId()
    expect(first).toBeTruthy()
    expect(getDeviceId()).toBe(first)
  })

  it("a versão-base começa desconhecida e ignora lixo", () => {
    expect(readCloudBase("knowledge")).toBeNull()
    writeCloudBase("knowledge", 7)
    expect(readCloudBase("knowledge")).toBe(7)
    expect(readCloudBase("bestiary")).toBeNull()
    localStorage.setItem("runas-dm.cloud-base.bestiary", "abc")
    expect(readCloudBase("bestiary")).toBeNull()
  })

  it("sem armazenamento disponível nada quebra", () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("bloqueado") }, setItem() { throw new Error("bloqueado") } })
    vi.stubGlobal("sessionStorage", { getItem() { throw new Error("bloqueado") }, setItem() { throw new Error("bloqueado") }, removeItem() { throw new Error("bloqueado") } })
    expect(readCloudBase("knowledge")).toBeNull()
    expect(() => writeCloudBase("knowledge", 1)).not.toThrow()
    expect(readBackupToken()).toBe("")
    expect(() => saveBackupToken("x")).not.toThrow()
    expect(() => clearBackupToken()).not.toThrow()
    expect(getDeviceId()).toBe("dispositivo-sem-armazenamento")
  })
})

describe("compressão", () => {
  it("ida e volta em gzip e sem compressão devolve o mesmo texto, com acentos", async () => {
    const text = JSON.stringify({ título: "Campanha [O&C] Lion Heart pt. II", tags: ["Sessões"], n: "x".repeat(50_000) })
    const packed = await gzipText(text)
    expect(packed.encoding).toBe("gzip")
    expect(packed.bytes.byteLength).toBeLessThan(text.length / 5)
    expect(await decodeBackupBytes(packed.bytes.buffer, "gzip")).toBe(text)
    expect(await decodeBackupBytes(new TextEncoder().encode(text).buffer as ArrayBuffer, "identity")).toBe(text)
  })

  it("sem CompressionStream o envio segue sem compressão", async () => {
    vi.stubGlobal("CompressionStream", undefined)
    const packed = await gzipText('{"a":1}')
    expect(packed.encoding).toBe("identity")
    expect(new TextDecoder().decode(packed.bytes)).toBe('{"a":1}')
  })
})

describe("envio à nuvem", () => {
  it("envia o payload comprimido com a versão-base e as estatísticas, e memoriza a versão gravada", async () => {
    writeCloudBase("knowledge", 4)
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, version: 5, updatedAt: 99 }))
    const payload = { version: 3, campaigns: [{ title: "[O&C] Lion Heart pt. II" }] }
    const result = await putCloudBackup("knowledge", "segredo", { payload, stats })
    expect(result).toEqual({ ok: true, version: 5, updatedAt: 99, localOnly: false })
    expect(fetchMock.mock.calls[0][0]).toBe(CLOUD_PATHS.knowledge)
    expect(fetchMock.mock.calls[0][1]!.method).toBe("PUT")
    expect(requestHeaders()).toMatchObject({ authorization: "Bearer segredo", "x-runas-encoding": "gzip", "x-runas-base-version": "4", "x-runas-device": getDeviceId() })
    expect(JSON.parse(requestHeaders()["x-runas-stats"])).toEqual(stats)
    expect(requestHeaders()["x-runas-force"]).toBeUndefined()
    expect(await sentPayload()).toEqual(payload)
    expect(readCloudBase("knowledge")).toBe(5)
  })

  it("sem versão-base conhecida o cabeçalho não é enviado (dispositivo novo)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, version: 1, updatedAt: 1 }))
    await putCloudBackup("bestiary", "t", { payload: {}, stats })
    expect(fetchMock.mock.calls[0][0]).toBe(CLOUD_PATHS.bestiary)
    expect(requestHeaders()["x-runas-base-version"]).toBeUndefined()
  })

  it("`force` é enviado só quando pedido", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, version: 2, updatedAt: 1 }))
    await putCloudBackup("knowledge", "t", { payload: {}, stats, force: true })
    expect(requestHeaders()["x-runas-force"]).toBe("1")
  })

  it("o preview local não grava nada na nuvem e por isso não memoriza versão", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, version: 0, updatedAt: 1, localOnly: true }))
    const result = await putCloudBackup("knowledge", "t", { payload: {}, stats })
    expect(result).toMatchObject({ ok: true, localOnly: true })
    expect(readCloudBase("knowledge")).toBeNull()
  })

  it("um conflito devolve o que a nuvem já tem e não muda a versão-base", async () => {
    writeCloudBase("knowledge", 2)
    const head = { version: 9, updatedAt: 1_000, stats: { total: 812, pages: 800, campaigns: 3, tags: 9 }, legacy: false, deviceId: "outro", baseVersion: 8, bytes: 10, encoding: "gzip", checkpoint: false }
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "A nuvem tem uma versão que este dispositivo ainda não recebeu. Nada foi sobrescrito.", reason: "stale", head }, 409))
    const result = await putCloudBackup("knowledge", "t", { payload: {}, stats })
    expect(result).toMatchObject({ ok: false, reason: "stale", head: { version: 9 } })
    expect((result as { message: string }).message).toContain("Nada foi sobrescrito")
    expect(readCloudBase("knowledge")).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("se a resposta de uma gravação anterior se perdeu, adota a versão e repete uma única vez", async () => {
    const device = getDeviceId()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "stale", reason: "stale", head: { version: 1, updatedAt: 1, stats, legacy: false, deviceId: device, baseVersion: 0, bytes: 1, encoding: "gzip", checkpoint: false } }, 409))
      .mockResolvedValueOnce(jsonResponse({ ok: true, version: 2, updatedAt: 5 }))
    const result = await putCloudBackup("knowledge", "t", { payload: { atual: true }, stats })
    expect(result).toMatchObject({ ok: true, version: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestHeaders(1)["x-runas-base-version"]).toBe("1")
    expect(await sentPayload(1)).toEqual({ atual: true })
  })

  it("um conflito de outro dispositivo nunca é adotado, mesmo com a mesma base", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "stale", reason: "stale", head: { version: 1, updatedAt: 1, stats, legacy: false, deviceId: "outro-pc", baseVersion: 0, bytes: 1, encoding: "gzip", checkpoint: false } }, 409))
    const result = await putCloudBackup("knowledge", "t", { payload: {}, stats })
    expect(result).toMatchObject({ ok: false, reason: "stale" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("encolhimento, token inválido, limite de tamanho, erro do servidor e falta de rede têm resultados próprios", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Este envio removeria dados demais da nuvem. Nada foi sobrescrito.", reason: "shrink", head: null }, 409))
    expect(await putCloudBackup("knowledge", "t", { payload: {}, stats })).toMatchObject({ ok: false, reason: "shrink" })
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Não autorizado." }, 401))
    expect(await putCloudBackup("knowledge", "t", { payload: {}, stats })).toEqual({ ok: false, reason: "unauthorized", message: "Token de backup inválido." })
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "O backup passa do limite de 32 MB.", reason: "too-large", limitBytes: 32_000_000 }, 413))
    expect(await putCloudBackup("bestiary", "t", { payload: {}, stats })).toMatchObject({ ok: false, reason: "too-large", limitBytes: 32_000_000 })
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Falha ao gravar o backup na nuvem.", detail: "D1_ERROR: no such table" }, 500))
    expect(await putCloudBackup("knowledge", "t", { payload: {}, stats })).toEqual({ ok: false, reason: "unavailable", message: "Falha ao gravar o backup na nuvem. (D1_ERROR: no such table)" })
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    expect(await putCloudBackup("knowledge", "t", { payload: {}, stats })).toEqual({ ok: false, reason: "unavailable", message: "Sem conexão com a nuvem." })
  })
})

describe("leitura da nuvem", () => {
  const headers = (extra: Record<string, string> = {}) => ({ "x-runas-version": "3", "x-runas-updated-at": "1000", "x-runas-encoding": "gzip", "x-runas-legacy": "0", "x-runas-device": "pc", "x-runas-base-version": "2", "x-runas-stats": JSON.stringify(stats), ...extra })

  it("lê e descomprime a versão mais recente, com a cabeça vinda dos cabeçalhos", async () => {
    const data = { version: 3, campaigns: [{ id: "c", title: "[O&C] Lion Heart pt. II" }] }
    const packed = await gzipText(JSON.stringify(data))
    fetchMock.mockResolvedValueOnce(new Response(packed.bytes, { headers: headers() }))
    const result = await fetchCloudBackup("knowledge", "t")
    expect(result).toMatchObject({ ok: true, empty: false, data, head: { version: 3, updatedAt: 1000, stats, legacy: false, deviceId: "pc", baseVersion: 2, encoding: "gzip" } })
    expect(fetchMock.mock.calls[0][0]).toBe(CLOUD_PATHS.knowledge)
    expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>).authorization).toBe("Bearer t")
  })

  it("pede uma versão específica e lê o backup antigo (texto puro) como versão 1", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ version: 3, campaigns: [] }), { headers: { "x-runas-version": "1", "x-runas-updated-at": "5", "x-runas-encoding": "identity", "x-runas-legacy": "1" } }))
    const result = await fetchCloudBackup<{ version: number }>("knowledge", "t", 1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${CLOUD_PATHS.knowledge}?version=1`)
    expect(result).toMatchObject({ ok: true, empty: false, data: { version: 3 }, head: { version: 1, legacy: true, encoding: "identity" } })
  })

  it("sem backup na nuvem devolve `empty`; localhost avisa que é só local", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ head: null }))
    expect(await fetchCloudBackup("bestiary", "t")).toEqual({ ok: true, empty: true, localOnly: false })
    fetchMock.mockResolvedValueOnce(jsonResponse({ head: null, localOnly: true }))
    expect(await fetchCloudBackup("knowledge", "t")).toEqual({ ok: true, empty: true, localOnly: true })
  })

  it("token inválido, servidor com erro, sem rede e conteúdo corrompido não passam em silêncio", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401))
    expect(await fetchCloudBackup("knowledge", "t")).toMatchObject({ ok: false, reason: "unauthorized" })
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "O banco de dados da nuvem não está disponível neste ambiente." }, 503))
    expect(await fetchCloudBackup("knowledge", "t")).toEqual({ ok: false, reason: "unavailable", message: "O banco de dados da nuvem não está disponível neste ambiente." })
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    expect(await fetchCloudBackup("knowledge", "t")).toEqual({ ok: false, reason: "unavailable", message: "Sem conexão com a nuvem." })
    fetchMock.mockResolvedValueOnce(new Response("não é gzip", { headers: headers() }))
    expect(await fetchCloudBackup("knowledge", "t")).toEqual({ ok: false, reason: "unavailable", message: "O backup na nuvem está ilegível." })
  })

  it("lista as versões disponíveis", async () => {
    const head = { version: 2, updatedAt: 9, stats, legacy: false, deviceId: "pc", baseVersion: 1, bytes: 1, encoding: "gzip", checkpoint: false }
    fetchMock.mockResolvedValueOnce(jsonResponse({ head, versions: [head, { ...head, version: 1, checkpoint: true }] }))
    const result = await fetchCloudMeta("knowledge", "t")
    expect(fetchMock.mock.calls[0][0]).toBe(`${CLOUD_PATHS.knowledge}?meta=1`)
    expect(result).toMatchObject({ ok: true, head: { version: 2 }, localOnly: false })
    expect((result as { versions: unknown[] }).versions).toHaveLength(2)
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401))
    expect(await fetchCloudMeta("knowledge", "t")).toMatchObject({ ok: false, reason: "unauthorized" })
  })

  it("descreve uma cópia para o usuário", () => {
    const text = describeCloudHead({ version: 1, updatedAt: Date.UTC(2026, 8, 24, 18, 3), stats, legacy: false, deviceId: "", baseVersion: 0, bytes: 1, encoding: "gzip", checkpoint: false })
    expect(text).toContain("2 páginas · 1 campanha · 0 tags")
    expect(text).toMatch(/24\/09\/2026|24\/09\/26/)
  })
})

describe("assinatura do conteúdo enviado", () => {
  it("o hash muda com qualquer mudança de conteúdo e é estável para o mesmo texto", () => {
    expect(hashText("abc")).toBe(hashText("abc"))
    expect(hashText("abc")).not.toBe(hashText("abd"))
    expect(hashText("")).toMatch(/^[0-9a-f]{8}:0$/)
    expect(hashText("[O&C] Lion Heart pt. II")).not.toBe(hashText("O&C] Lion Heart pt. II"))
  })

  it("guarda a assinatura por tipo de backup", () => {
    expect(readCloudSignature("knowledge")).toBeNull()
    writeCloudSignature("knowledge", "abc")
    expect(readCloudSignature("knowledge")).toBe("abc")
    expect(readCloudSignature("bestiary")).toBeNull()
  })
})
