import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CLOUD_PATHS, decodeBackupBytes, gzipText } from "./cloud-backup"
import { DIRECTORY_COLLECTION_ID, fetchCloudDirectory, pushCollectionDirectory, type CollectionDirectory } from "./collection-directory"

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
const DIR_URL = `${CLOUD_PATHS.knowledge}?collection=${encodeURIComponent(DIRECTORY_COLLECTION_ID)}`

async function directoryResponse(directory: unknown): Promise<Response> {
  const packed = await gzipText(JSON.stringify(directory))
  return new Response(packed.bytes, { headers: { "x-runas-version": "1", "x-runas-updated-at": "1000", "x-runas-encoding": packed.encoding, "x-runas-legacy": "0", "x-runas-device": "outro-pc", "x-runas-base-version": "0" } })
}

async function sentPayload(callIndex: number): Promise<CollectionDirectory> {
  const init = fetchMock.mock.calls[callIndex][1]!
  const body = init.body as Uint8Array<ArrayBuffer>
  const encoding = (init.headers as Record<string, string>)["x-runas-encoding"]
  return JSON.parse(await decodeBackupBytes(body.buffer, encoding)) as CollectionDirectory
}

describe("fetchCloudDirectory", () => {
  it("sem backup na nuvem devolve um diretório vazio", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ head: null }))
    expect(await fetchCloudDirectory("knowledge", "t")).toEqual({ version: 1, collections: [] })
    expect(fetchMock.mock.calls[0][0]).toBe(DIR_URL)
  })

  it("lê e normaliza o diretório, ignorando entradas malformadas", async () => {
    const raw = { version: 1, collections: [{ id: "wiki-1", name: "Ordem x Caos", updatedAt: 10 }, { id: "", name: "sem id" }, "lixo", { id: "bestiario-1", name: "Azul", updatedAt: 3, system: "runas-blue" }] }
    fetchMock.mockResolvedValueOnce(await directoryResponse(raw))
    const result = await fetchCloudDirectory("bestiary", "t")
    expect(result).toEqual({ version: 1, collections: [{ id: "wiki-1", name: "Ordem x Caos", updatedAt: 10 }, { id: "bestiario-1", name: "Azul", updatedAt: 3, system: "runas-blue" }] })
  })

  it("qualquer falha devolve null, nunca lança", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401))
    expect(await fetchCloudDirectory("knowledge", "t")).toBeNull()
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    expect(await fetchCloudDirectory("knowledge", "t")).toBeNull()
  })
})

describe("pushCollectionDirectory", () => {
  it("não grava nada quando a fusão não traz novidade", async () => {
    const remote: CollectionDirectory = { version: 1, collections: [{ id: "default", name: "Wiki", updatedAt: 5 }] }
    fetchMock.mockResolvedValueOnce(await directoryResponse(remote))
    await pushCollectionDirectory("knowledge", "t", remote)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("publica a união de local e remoto", async () => {
    const remote: CollectionDirectory = { version: 1, collections: [{ id: "default", name: "Wiki", updatedAt: 5 }] }
    const local: CollectionDirectory = { version: 1, collections: [{ id: "default", name: "Wiki", updatedAt: 5 }, { id: "wiki-novo", name: "Ordem x Caos", updatedAt: 20 }] }
    fetchMock.mockResolvedValueOnce(await directoryResponse(remote))
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, version: 2, updatedAt: 50 }))
    await pushCollectionDirectory("knowledge", "t", local)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe(DIR_URL)
    expect(fetchMock.mock.calls[1][1]!.method).toBe("PUT")
    const sent = await sentPayload(1)
    expect(sent.collections.map((entry) => entry.id).sort()).toEqual(["default", "wiki-novo"])
  })

  it("em conflito com outra coleção mais nova, mantém a mais recente", async () => {
    const remote: CollectionDirectory = { version: 1, collections: [{ id: "default", name: "Renomeada em outro PC", updatedAt: 99 }] }
    const local: CollectionDirectory = { version: 1, collections: [{ id: "default", name: "Wiki", updatedAt: 5 }, { id: "wiki-novo", name: "Ordem x Caos", updatedAt: 20 }] }
    fetchMock.mockResolvedValueOnce(await directoryResponse(remote))
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, version: 2, updatedAt: 50 }))
    await pushCollectionDirectory("knowledge", "t", local)
    const sent = await sentPayload(1)
    expect(sent.collections.find((entry) => entry.id === "default")).toEqual({ id: "default", name: "Renomeada em outro PC", updatedAt: 99 })
  })

  it("em conflito de versão (stale) de outro dispositivo, busca de novo e tenta mais vezes", async () => {
    const local: CollectionDirectory = { version: 1, collections: [{ id: "wiki-novo", name: "Ordem x Caos", updatedAt: 20 }] }
    fetchMock
      .mockResolvedValueOnce(await directoryResponse({ version: 1, collections: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "stale", reason: "stale", head: { version: 2, updatedAt: 1, stats: { total: 1 }, legacy: false, deviceId: "outro-pc", baseVersion: 0, bytes: 1, encoding: "gzip", checkpoint: false } }, 409))
      .mockResolvedValueOnce(await directoryResponse({ version: 1, collections: [{ id: "wiki-outro", name: "Criada em outro PC", updatedAt: 30 }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, version: 3, updatedAt: 60 }))
    await pushCollectionDirectory("knowledge", "t", local)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const sent = await sentPayload(3)
    expect(sent.collections.map((entry) => entry.id).sort()).toEqual(["wiki-novo", "wiki-outro"])
  })

  it("desiste de tentar depois do limite de tentativas em conflito contínuo", async () => {
    const local: CollectionDirectory = { version: 1, collections: [{ id: "wiki-novo", name: "Ordem x Caos", updatedAt: 20 }] }
    const stale = jsonResponse({ error: "stale", reason: "stale", head: { version: 2, updatedAt: 1, stats: { total: 1 }, legacy: false, deviceId: "outro-pc", baseVersion: 0, bytes: 1, encoding: "gzip", checkpoint: false } }, 409)
    fetchMock.mockImplementation(async (_url, init) => init?.method === "PUT" ? stale.clone() : directoryResponse({ version: 1, collections: [] }))
    await pushCollectionDirectory("knowledge", "t", local)
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it("em encolhimento (ex.: uma gravação anterior malformada declarou um total maior), reenvia forçando — é só um índice de descoberta", async () => {
    const remote: CollectionDirectory = { version: 1, collections: [{ id: "default", name: "Wiki", updatedAt: 5 }] }
    const local: CollectionDirectory = { version: 1, collections: [{ id: "default", name: "Wiki", updatedAt: 5 }, { id: "wiki-novo", name: "Ordem x Caos", updatedAt: 20 }] }
    fetchMock
      .mockResolvedValueOnce(await directoryResponse(remote))
      .mockResolvedValueOnce(jsonResponse({ error: "shrink", reason: "shrink", head: null }, 409))
      .mockResolvedValueOnce(jsonResponse({ ok: true, version: 2, updatedAt: 50 }))
    await pushCollectionDirectory("knowledge", "t", local)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((fetchMock.mock.calls[2][1]!.headers as Record<string, string>)["x-runas-force"]).toBe("1")
    const sent = await sentPayload(2)
    expect(sent.collections.map((entry) => entry.id).sort()).toEqual(["default", "wiki-novo"])
  })
})
