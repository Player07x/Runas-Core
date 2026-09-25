import { beforeEach, describe, expect, it } from "vitest"
import type { CheckpointPolicy } from "../snapshot-policy"
import { createD1BackupStore, resetBackupTablesCache } from "./d1-backup-store"
import { createMemoryBackupStore } from "./memory-backup-store"
import { BACKUP_CHUNK_BYTES, BACKUP_MAX_BYTES, joinChunks, listBackupMeta, putBackup, readBackup, readHead, splitChunks, type BackupKind, type BackupRow, type BackupStore, type PutInput } from "./versioned-backup"

const HOUR = 60 * 60 * 1000
const policy: CheckpointPolicy = { intervalMs: 6 * HOUR, keep: 2 }
const encode = (text: string) => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

type SqliteModule = typeof import("node:sqlite")
let sqlite: SqliteModule | null = null
try { sqlite = await import("node:sqlite") } catch { sqlite = null }

/** D1 de mentira sobre SQLite de verdade: valida o SQL, os BLOBs, o lote atômico e a chave primária. */
function createSqliteD1(legacy: Partial<Record<BackupKind, { payload: string; updatedAt: number }>> = {}) {
  const database = new sqlite!.DatabaseSync(":memory:")
  database.exec("CREATE TABLE knowledge_snapshots (id text PRIMARY KEY NOT NULL, payload text NOT NULL, updated_at integer NOT NULL)")
  database.exec("CREATE TABLE backup_snapshots (id text PRIMARY KEY NOT NULL, payload text NOT NULL, updated_at integer NOT NULL)")
  const tables: Record<BackupKind, string> = { knowledge: "knowledge_snapshots", bestiary: "backup_snapshots" }
  for (const [kind, item] of Object.entries(legacy) as Array<[BackupKind, { payload: string; updatedAt: number }]>) {
    database.prepare(`INSERT INTO ${tables[kind]} (id, payload, updated_at) VALUES ('primary', ?, ?)`).run(item.payload, item.updatedAt)
  }
  class Statement {
    constructor(readonly sql: string, readonly values: unknown[] = []) {}
    bind(...values: unknown[]) { return new Statement(this.sql, values) }
    private statement() { return database.prepare(this.sql) }
    async run() { this.statement().run(...(this.values as never[])); return { success: true } }
    async all<T>() { return { results: this.statement().all(...(this.values as never[])) as T[], success: true } }
    async first<T>() { return (this.statement().get(...(this.values as never[])) ?? null) as T | null }
  }
  const d1 = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      database.exec("BEGIN")
      try {
        for (const statement of statements) await statement.run()
        database.exec("COMMIT")
      } catch (error) {
        database.exec("ROLLBACK")
        throw error
      }
      return []
    },
  }
  return { d1: d1 as unknown as D1Database, database }
}

function put(store: BackupStore, kind: BackupKind, body: string | Uint8Array, overrides: Partial<PutInput> = {}) {
  return putBackup(store, kind, { body: typeof body === "string" ? encode(body) : body, encoding: "identity", baseVersion: null, stats: { total: 10 }, deviceId: "notebook", force: false, now: 1_000, ...overrides }, policy)
}

function suite(name: string, createStore: (legacy?: Partial<Record<BackupKind, { payload: string; updatedAt: number }>>) => BackupStore) {
  describe(`backup versionado (${name})`, () => {
    beforeEach(() => resetBackupTablesCache())

    it("o primeiro envio cria a versão 1 e a leitura devolve exatamente os mesmos bytes", async () => {
      const store = createStore()
      expect(await readHead(store, "knowledge")).toBeNull()
      expect(await readBackup(store, "knowledge")).toBeNull()
      const result = await put(store, "knowledge", "primeiro", { baseVersion: null, stats: { total: 3, pages: 2, campaigns: 1 }, encoding: "gzip", now: 5_000 })
      expect(result).toEqual({ ok: true, version: 1, updatedAt: 5_000 })
      const read = await readBackup(store, "knowledge")
      expect(decode(read!.body)).toBe("primeiro")
      expect(read!.head).toMatchObject({ version: 1, updatedAt: 5_000, legacy: false, encoding: "gzip", deviceId: "notebook", stats: { total: 3, pages: 2, campaigns: 1 } })
    })

    it("depois do primeiro envio, só vence quem declara a versão atual como base", async () => {
      const store = createStore()
      await put(store, "knowledge", "v1")
      expect(await put(store, "knowledge", "sem base")).toMatchObject({ ok: false, status: 409, reason: "stale" })
      expect(await put(store, "knowledge", "base velha", { baseVersion: 0 })).toMatchObject({ ok: false, status: 409, reason: "stale" })
      expect(await put(store, "knowledge", "base do futuro", { baseVersion: 7 })).toMatchObject({ ok: false, status: 409, reason: "stale" })
      expect(decode((await readBackup(store, "knowledge"))!.body)).toBe("v1")
      expect(await put(store, "knowledge", "v2", { baseVersion: 1 })).toMatchObject({ ok: true, version: 2 })
      expect(decode((await readBackup(store, "knowledge"))!.body)).toBe("v2")
    })

    it("a resposta de conflito traz a cabeça, para o cliente mostrar o que a nuvem já tem", async () => {
      const store = createStore()
      await put(store, "knowledge", "v1", { stats: { total: 812 }, now: 9_000, deviceId: "pc-antigo" })
      const conflict = await put(store, "knowledge", "vazio", { stats: { total: 0 } })
      expect(conflict).toMatchObject({ ok: false, reason: "stale", head: { version: 1, updatedAt: 9_000, deviceId: "pc-antigo", stats: { total: 812 } } })
    })

    it("um dispositivo novo com o estado vazio nunca sobrescreve o backup bom", async () => {
      const store = createStore()
      await put(store, "knowledge", "backup bom", { stats: { total: 812 } })
      // Cenário real: o computador novo abre a Wiki, o estado local é vazio e o envio automático dispara.
      for (const baseVersion of [null, 0]) {
        expect(await put(store, "knowledge", "{}", { baseVersion, stats: { total: 0 } })).toMatchObject({ ok: false, status: 409 })
      }
      expect(decode((await readBackup(store, "knowledge"))!.body)).toBe("backup bom")
    })

    it("esvaziar ou encolher demais é recusado mesmo com a base certa; force libera e guarda a versão anterior", async () => {
      const store = createStore()
      await put(store, "knowledge", "cheio", { stats: { total: 100 } })
      expect(await put(store, "knowledge", "vazio", { baseVersion: 1, stats: { total: 0 } })).toMatchObject({ ok: false, status: 409, reason: "shrink" })
      expect(await put(store, "knowledge", "quase", { baseVersion: 1, stats: { total: 59 } })).toMatchObject({ ok: false, reason: "shrink" })
      expect(await put(store, "knowledge", "metade", { baseVersion: 1, stats: { total: 60 } })).toMatchObject({ ok: true, version: 2 })
      const forced = await put(store, "knowledge", "vazio de propósito", { baseVersion: 2, stats: { total: 0 }, force: true, now: 2_000 })
      expect(forced).toMatchObject({ ok: true, version: 3 })
      // v1 virou o primeiro checkpoint ao ser substituída; v2 é guardada por causa do force.
      const { versions } = await listBackupMeta(store, "knowledge")
      expect(versions.map((item) => [item.version, item.checkpoint])).toEqual([[3, false], [2, true], [1, true]])
      expect(decode((await readBackup(store, "knowledge", 2))!.body)).toBe("metade")
      expect(decode((await readBackup(store, "knowledge", 1))!.body)).toBe("cheio")
    })

    it("force ignora a versão-base (substituir a nuvem por este dispositivo) e também preserva o que havia", async () => {
      const store = createStore()
      await put(store, "knowledge", "da nuvem", { stats: { total: 50 } })
      expect(await put(store, "knowledge", "deste dispositivo", { baseVersion: null, stats: { total: 40 }, force: true, now: 3_000 })).toMatchObject({ ok: true, version: 2 })
      expect(decode((await readBackup(store, "knowledge", 1))!.body)).toBe("da nuvem")
    })

    it("histórico: cabeça + checkpoints espaçados, e os mais antigos saem quando passam do limite", async () => {
      const store = createStore()
      const write = async (label: string, at: number, base: number) => put(store, "knowledge", label, { baseVersion: base || null, now: at })
      await write("v1", 0, 0)
      await write("v2", 60_000, 1) // v1 vira o primeiro checkpoint
      await write("v3", 120_000, 2) // v2 é descartado: 1 minuto depois do último checkpoint
      expect((await listBackupMeta(store, "knowledge")).versions.map((item) => item.version)).toEqual([3, 1])
      await write("v4", 7 * HOUR, 3)
      await write("v5", 7 * HOUR + 60_000, 4) // v4 passou de 6 h do checkpoint anterior: fica
      expect((await listBackupMeta(store, "knowledge")).versions.map((item) => item.version)).toEqual([5, 4, 1])
      await write("v6", 14 * HOUR, 5)
      await write("v7", 14 * HOUR + 60_000, 6) // v6 vira checkpoint; com keep = 2 o mais antigo (v1) sai
      const versions = (await listBackupMeta(store, "knowledge")).versions
      expect(versions.map((item) => item.version)).toEqual([7, 6, 4])
      expect(await readBackup(store, "knowledge", 1)).toBeNull()
      expect(decode((await readBackup(store, "knowledge", 4))!.body)).toBe("v4")
    })

    it("divide o payload em blocos e devolve bytes idênticos", async () => {
      const store = createStore()
      const body = new Uint8Array(BACKUP_CHUNK_BYTES * 2 + 1234)
      for (let index = 0; index < body.length; index += 1) body[index] = (index * 31 + 7) & 255
      expect(await put(store, "bestiary", body, { stats: { total: 1 } })).toMatchObject({ ok: true })
      const read = await readBackup(store, "bestiary")
      expect(read!.head.bytes).toBe(body.length)
      expect(read!.body.byteLength).toBe(body.length)
      expect(Buffer.compare(Buffer.from(read!.body), Buffer.from(body))).toBe(0)
      expect((await store.chunks("bestiary", 1)).map((chunk) => chunk.byteLength)).toEqual([BACKUP_CHUNK_BYTES, BACKUP_CHUNK_BYTES, 1234])
    })

    it("recusa corpo vazio e corpo acima do limite sem tocar no que existe", async () => {
      const store = createStore()
      await put(store, "knowledge", "v1")
      expect(await put(store, "knowledge", new Uint8Array(0), { baseVersion: 1 })).toMatchObject({ ok: false, status: 400, reason: "empty" })
      expect(await put(store, "knowledge", new Uint8Array(BACKUP_MAX_BYTES + 1), { baseVersion: 1 })).toMatchObject({ ok: false, status: 413, reason: "too-large" })
      expect((await readBackup(store, "knowledge"))!.head.version).toBe(1)
    })

    it("os dois tipos de backup são independentes", async () => {
      const store = createStore()
      await put(store, "knowledge", "wiki")
      await put(store, "bestiary", "fichas")
      expect(decode((await readBackup(store, "knowledge"))!.body)).toBe("wiki")
      expect(decode((await readBackup(store, "bestiary"))!.body)).toBe("fichas")
      expect(await put(store, "bestiary", "fichas 2", { baseVersion: 1 })).toMatchObject({ ok: true, version: 2 })
      expect((await readHead(store, "knowledge"))!.version).toBe(1)
    })

    describe("backup antigo (linha única) já existente no D1", () => {
      const legacy = { knowledge: { payload: JSON.stringify({ version: 3, campaigns: [{ id: "c" }] }), updatedAt: 777 } }

      it("aparece como a versão 1, legível, e nunca é apagado", async () => {
        const store = createStore(legacy)
        expect(await readHead(store, "knowledge")).toMatchObject({ version: 1, legacy: true, updatedAt: 777, stats: null })
        expect(await readHead(store, "bestiary")).toBeNull()
        const read = await readBackup(store, "knowledge")
        expect(JSON.parse(decode(read!.body))).toEqual({ version: 3, campaigns: [{ id: "c" }] })
        expect(read!.head.legacy).toBe(true)
      })

      it("um dispositivo novo não passa por cima dele; quem declarou a versão 1 cria a versão 2", async () => {
        const store = createStore(legacy)
        expect(await put(store, "knowledge", "{}", { baseVersion: null, stats: { total: 0 } })).toMatchObject({ ok: false, reason: "stale", head: { version: 1, legacy: true } })
        expect(await put(store, "knowledge", "{}", { baseVersion: 0, stats: { total: 0 } })).toMatchObject({ ok: false, reason: "stale" })
        expect(await put(store, "knowledge", "novo", { baseVersion: 1 })).toMatchObject({ ok: true, version: 2 })
        expect(decode((await readBackup(store, "knowledge"))!.body)).toBe("novo")
        // A linha antiga continua acessível como versão 1 depois de substituída.
        const { versions } = await listBackupMeta(store, "knowledge")
        expect(versions.map((item) => [item.version, item.legacy])).toEqual([[2, false], [1, true]])
        expect(JSON.parse(decode((await readBackup(store, "knowledge", 1))!.body))).toEqual({ version: 3, campaigns: [{ id: "c" }] })
      })

      it("force também pode substituir o backup antigo", async () => {
        const store = createStore(legacy)
        expect(await put(store, "knowledge", "substituto", { baseVersion: null, force: true })).toMatchObject({ ok: true, version: 2 })
      })
    })
  })
}

suite("em memória", (legacy) => createMemoryBackupStore(legacy))

describe.skipIf(!sqlite)("backup versionado sobre o D1", () => {
  suite("SQL real (SQLite)", (legacy) => createD1BackupStore(createSqliteD1(legacy).d1))

  beforeEach(() => resetBackupTablesCache())

  it("uma versão repetida desfaz o lote inteiro e devolve `false` (outra gravação chegou primeiro)", async () => {
    const { d1, database } = createSqliteD1()
    const store = createD1BackupStore(d1)
    await put(store, "knowledge", "v1")
    const row: BackupRow = { kind: "knowledge", version: 1, createdAt: 2, deviceId: "x", baseVersion: 0, encoding: "identity", bytes: 3, chunkCount: 1, stats: { total: 1 }, checkpoint: false }
    expect(await store.commit("knowledge", { row, chunks: [encode("xxx")], markCheckpoint: null, dropVersions: [] })).toBe(false)
    const stored = database.prepare("SELECT COUNT(*) AS n FROM cloud_backup_chunks WHERE kind = 'knowledge'").get() as { n: number }
    expect(stored.n).toBe(1)
    expect(decode((await readBackup(store, "knowledge"))!.body)).toBe("v1")
  })

  it("as tabelas são criadas na primeira utilização e as tabelas antigas nunca são alteradas", async () => {
    const { d1, database } = createSqliteD1({ knowledge: { payload: "antigo", updatedAt: 1 } })
    const store = createD1BackupStore(d1)
    await put(store, "knowledge", "novo", { baseVersion: 1 })
    const tables = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((table) => table.name)
    expect(tables).toEqual(expect.arrayContaining(["cloud_backups", "cloud_backup_chunks", "knowledge_snapshots", "backup_snapshots"]))
    expect(database.prepare("SELECT payload FROM knowledge_snapshots WHERE id = 'primary'").get()).toEqual({ payload: "antigo" })
  })

  it("um banco sem as tabelas antigas simplesmente não tem legado", async () => {
    const database = new sqlite!.DatabaseSync(":memory:")
    const d1 = {
      prepare: (sql: string) => {
        const make = (values: unknown[]): unknown => ({
          bind: (...next: unknown[]) => make(next),
          run: async () => { database.prepare(sql).run(...(values as never[])); return {} },
          all: async () => ({ results: database.prepare(sql).all(...(values as never[])) }),
          first: async () => database.prepare(sql).get(...(values as never[])) ?? null,
        })
        return make([])
      },
      batch: async (statements: Array<{ run(): Promise<unknown> }>) => { for (const statement of statements) await statement.run(); return [] },
    } as unknown as D1Database
    const store = createD1BackupStore(d1)
    expect(await readHead(store, "knowledge")).toBeNull()
    expect(await put(store, "knowledge", "primeiro")).toMatchObject({ ok: true, version: 1 })
  })
})

describe("blocos", () => {
  it("dividir e juntar é a identidade, inclusive nas bordas", () => {
    for (const size of [0, 1, BACKUP_CHUNK_BYTES - 1, BACKUP_CHUNK_BYTES, BACKUP_CHUNK_BYTES + 1, BACKUP_CHUNK_BYTES * 3]) {
      const bytes = new Uint8Array(size).map((_, index) => index % 251)
      expect(Buffer.compare(Buffer.from(joinChunks(splitChunks(bytes))), Buffer.from(bytes))).toBe(0)
    }
    expect(splitChunks(new Uint8Array(0))).toEqual([])
  })
})
