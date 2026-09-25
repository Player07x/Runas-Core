import { describe, expect, it } from "vitest"
import { VAULT_DATA_FILES, VAULT_README_PATH, VAULT_VERSIONS_FOLDER, inspectVaultData, loadVaultData, parseVaultData, parseVaultHeaderPrefix, saveVaultData, serializeVaultData, versionFileName, versionFileTime, type KnownRevision, type VaultDataAdapter, type VaultDataHeader, type VaultSaveInput } from "./vault-data"

const HOUR = 60 * 60 * 1000
const CAMPAIGN = "[O&C] Lion Heart pt. II"

function memoryVault(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial))
  const writes: string[] = []
  const adapter: VaultDataAdapter = {
    async readText(path) { return files.get(path) ?? null },
    async readTextPrefix(path, bytes) { const text = files.get(path); return text === undefined ? null : text.slice(0, bytes) },
    async writeText(path, content) { writes.push(path); files.set(path, content) },
    async remove(path) { files.delete(path) },
    async list(folder) { return [...files.keys()].filter((path) => path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes("/")).map((path) => path.slice(folder.length + 1)) },
  }
  return { adapter, files, writes }
}

const knowledgeData = { version: 3, campaigns: [{ id: "c1", title: CAMPAIGN, accentColor: "#9987a3", backgroundImageDataUrl: "data:image/webp;base64,AAAA" }], tags: [{ id: "t1", name: "Sessões", icon: "📜", color: "#87909b", pinnedIn: [] }], pages: [] }
const input = (overrides: Partial<VaultSaveInput> = {}): VaultSaveInput => ({ data: knowledgeData, signature: "assinatura-1", counts: { total: 10, pages: 8, campaigns: 1, tags: 1 }, pristine: false, ...overrides })
const ME = "notebook-antigo"
const context = (known: KnownRevision | null, extra: { force?: boolean; now?: number; writerId?: string } = {}) => ({ writerId: extra.writerId ?? ME, known, force: extra.force, now: extra.now ?? 1_700_000_000_000 })

describe("formato do arquivo", () => {
  const header: VaultDataHeader = { format: "runas-dm-vault-data", kind: "knowledge", version: 1, revision: 3, writerId: "w", savedAt: 5, counts: { total: 2, pages: 2 }, contentHash: "abc", preferences: { theme: "light", gridDensity: "large" } }

  it("é um JSON válido com o cabeçalho antes de `data`", () => {
    const text = serializeVaultData(header, JSON.stringify(knowledgeData))
    const parsed = JSON.parse(text) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(["format", "kind", "version", "revision", "writerId", "savedAt", "counts", "contentHash", "preferences", "data"])
    expect(parsed.data).toEqual(knowledgeData)
  })

  it("o cabeçalho sai só do começo do arquivo, mesmo com `data` enorme", () => {
    const big = { pages: Array.from({ length: 5000 }, (_, index) => ({ id: `p${index}`, title: "x".repeat(200) })) }
    const text = serializeVaultData(header, JSON.stringify(big))
    expect(text.length).toBeGreaterThan(1_000_000)
    expect(parseVaultHeaderPrefix(text.slice(0, 8192))).toEqual(header)
    expect(parseVaultData(text)?.header).toEqual(header)
  })

  it("rejeita cabeçalho inválido em vez de aceitar lixo", () => {
    expect(parseVaultHeaderPrefix('{"format":"outra-coisa","kind":"knowledge"},"data":{}}')).toBeNull()
    expect(parseVaultHeaderPrefix("não é json")).toBeNull()
    expect(parseVaultHeaderPrefix('{"format":"runas-dm-vault-data"')).toBeNull()
    expect(parseVaultData('{"format":"runas-dm-vault-data","kind":"knowledge","version":1,"revision":-1,"writerId":"w","savedAt":1,"counts":{"total":1},"data":{}}')).toBeNull()
    expect(parseVaultData("[1,2]")).toBeNull()
  })

  it("nomes de versões anteriores carregam a data e voltam a ser lidos", () => {
    const at = Date.UTC(2026, 8, 24, 18, 3, 7, 42)
    const name = versionFileName("knowledge", at)
    expect(name).toBe("wiki-e-campanhas-2026-09-24T18-03-07-042Z.json")
    expect(versionFileTime(name)).toBe(at)
    expect(versionFileTime("qualquer.json")).toBeNull()
  })
})

describe("gravar os dados no vault", () => {
  it("cria o arquivo, o LEIA-ME da pasta e a revisão 1, e a leitura devolve exatamente o que foi gravado", async () => {
    const { adapter, files } = memoryVault()
    const outcome = await saveVaultData(adapter, "knowledge", input({ preferences: { theme: "light" } }), context(null))
    expect(outcome).toMatchObject({ status: "saved", header: { revision: 1, writerId: ME, kind: "knowledge" }, known: { revision: 1, writerId: ME }, checkpointed: false })
    expect(files.has(VAULT_DATA_FILES.knowledge)).toBe(true)
    expect(files.get(VAULT_README_PATH)).toContain("runas_system: true")
    const loaded = await loadVaultData<typeof knowledgeData>(adapter, "knowledge")
    expect(loaded).toMatchObject({ status: "ok", header: { revision: 1, preferences: { theme: "light" } }, data: knowledgeData })
    // O nome da campanha com colchetes, o estilo e a imagem voltam intactos.
    expect(loaded.status === "ok" && loaded.data.campaigns[0]).toEqual(knowledgeData.campaigns[0])
  })

  it("não reescreve o arquivo quando nada mudou, e regrava quando muda", async () => {
    const { adapter, writes } = memoryVault()
    const first = await saveVaultData(adapter, "knowledge", input(), context(null))
    if (first.status !== "saved") throw new Error("esperava gravar")
    const writesAfterFirst = writes.length
    const same = await saveVaultData(adapter, "knowledge", input(), context(first.known))
    expect(same).toMatchObject({ status: "unchanged", known: { revision: 1 } })
    expect(writes).toHaveLength(writesAfterFirst)
    const changed = await saveVaultData(adapter, "knowledge", input({ signature: "assinatura-2" }), context(first.known))
    expect(changed).toMatchObject({ status: "saved", header: { revision: 2 } })
  })

  it("uma mudança só nas preferências também é gravada", async () => {
    const { adapter } = memoryVault()
    const first = await saveVaultData(adapter, "knowledge", input({ preferences: { theme: "dark" } }), context(null))
    if (first.status !== "saved") throw new Error("esperava gravar")
    expect(await saveVaultData(adapter, "knowledge", input({ preferences: { theme: "light" } }), context(first.known))).toMatchObject({ status: "saved", header: { revision: 2, preferences: { theme: "light" } } })
  })

  it("um dispositivo virgem nunca grava nem cria arquivo algum", async () => {
    const { adapter, files, writes } = memoryVault()
    expect(await saveVaultData(adapter, "knowledge", input({ pristine: true, counts: { total: 0 } }), context(null))).toEqual({ status: "skipped-pristine" })
    expect(writes).toEqual([])
    expect(files.size).toBe(0)
  })

  it("o cenário do acidente: um computador novo com estado vazio não apaga o arquivo bom do vault", async () => {
    const { adapter, files } = memoryVault()
    const first = await saveVaultData(adapter, "knowledge", input({ counts: { total: 812 } }), context(null, { writerId: "computador-antigo" }))
    if (first.status !== "saved") throw new Error("esperava gravar")
    const before = files.get(VAULT_DATA_FILES.knowledge)
    // Computador novo: nunca leu este arquivo (known = null), então nem o estado virgem nem um estado parcial o sobrescrevem.
    expect(await saveVaultData(adapter, "knowledge", input({ pristine: true, counts: { total: 0 } }), context(null, { writerId: "computador-novo" }))).toEqual({ status: "skipped-pristine" })
    const partial = await saveVaultData(adapter, "knowledge", input({ signature: "so-o-que-veio-das-notas", counts: { total: 140 } }), context(null, { writerId: "computador-novo" }))
    expect(partial).toMatchObject({ status: "conflict", reason: "foreign", existing: { writerId: "computador-antigo", counts: { total: 812 } } })
    expect(files.get(VAULT_DATA_FILES.knowledge)).toBe(before)
  })

  it("um arquivo gravado por outro navegador nunca é sobrescrito, mesmo com o conteúdo maior", async () => {
    const { adapter, files } = memoryVault()
    await saveVaultData(adapter, "knowledge", input(), context(null, { writerId: "outro-pc" }))
    const before = files.get(VAULT_DATA_FILES.knowledge)
    const mine: KnownRevision = { revision: 1, writerId: "notebook-antigo" } // mesma revisão, outra autoria
    expect(await saveVaultData(adapter, "knowledge", input({ signature: "novo", counts: { total: 99 } }), context(mine))).toMatchObject({ status: "conflict", reason: "foreign" })
    expect(await saveVaultData(adapter, "knowledge", input({ signature: "novo", counts: { total: 99 } }), context({ revision: 0, writerId: "outro-pc" }))).toMatchObject({ status: "conflict", reason: "foreign" })
    expect(files.get(VAULT_DATA_FILES.knowledge)).toBe(before)
  })

  it("se o conteúdo é o mesmo que o outro navegador gravou, não há conflito e a revisão passa a ser conhecida", async () => {
    const { adapter } = memoryVault()
    await saveVaultData(adapter, "knowledge", input(), context(null, { writerId: "outro-pc" }))
    // Depois de restaurar do vault, este dispositivo tem exatamente o mesmo conteúdo.
    expect(await saveVaultData(adapter, "knowledge", input(), context(null))).toMatchObject({ status: "unchanged", known: { revision: 1, writerId: "outro-pc" } })
  })

  it("encolher demais o que já existe é recusado; forçar grava e guarda a versão anterior", async () => {
    const { adapter, files } = memoryVault()
    const first = await saveVaultData(adapter, "knowledge", input({ counts: { total: 100 } }), context(null, { now: 1_000 }))
    if (first.status !== "saved") throw new Error("esperava gravar")
    const shrink = input({ signature: "quase-vazio", counts: { total: 20 } })
    expect(await saveVaultData(adapter, "knowledge", shrink, context(first.known, { now: 2_000 }))).toMatchObject({ status: "conflict", reason: "shrink", existing: { counts: { total: 100 } } })
    const forced = await saveVaultData(adapter, "knowledge", shrink, context(first.known, { now: 3_000, force: true }))
    expect(forced).toMatchObject({ status: "saved", checkpointed: true, header: { revision: 2 } })
    const versions = [...files.keys()].filter((path) => path.startsWith(`${VAULT_VERSIONS_FOLDER}/`))
    expect(versions).toEqual([`${VAULT_VERSIONS_FOLDER}/${versionFileName("knowledge", 1_000)}`])
    expect(parseVaultData(files.get(versions[0])!)?.header.counts.total).toBe(100)
  })

  it("um arquivo ilegível nunca é sobrescrito sem confirmação; forçar guarda uma cópia dele", async () => {
    const { adapter, files } = memoryVault({ [VAULT_DATA_FILES.knowledge]: "{ conteúdo quebrado" })
    expect(await saveVaultData(adapter, "knowledge", input(), context(null))).toEqual({ status: "conflict", reason: "unreadable", existing: null })
    expect(files.get(VAULT_DATA_FILES.knowledge)).toBe("{ conteúdo quebrado")
    expect(await saveVaultData(adapter, "knowledge", input(), context(null, { force: true }))).toMatchObject({ status: "saved", header: { revision: 1 } })
  })

  it("um arquivo de uma versão mais nova do Runas DM não é tocado", async () => {
    const future = JSON.stringify({ format: "runas-dm-vault-data", kind: "knowledge", version: 99, revision: 5, writerId: "w", savedAt: 1, counts: { total: 3 }, contentHash: "", data: {} })
    const { adapter, files } = memoryVault({ [VAULT_DATA_FILES.knowledge]: future })
    expect(await saveVaultData(adapter, "knowledge", input(), context({ revision: 5, writerId: "w" }))).toEqual({ status: "unsupported", version: 99 })
    expect(await loadVaultData(adapter, "knowledge")).toEqual({ status: "unsupported", version: 99 })
    expect(files.get(VAULT_DATA_FILES.knowledge)).toBe(future)
  })

  it("histórico: uma cópia na primeira sobrescrita, nenhuma nas seguintes até passar o intervalo, e o excesso é apagado", async () => {
    const { adapter, files } = memoryVault()
    let known: KnownRevision | null = null
    const write = async (signature: string, now: number) => {
      const outcome = await saveVaultData(adapter, "knowledge", input({ signature }), context(known, { now }))
      if (outcome.status !== "saved") throw new Error(`esperava gravar (${signature}): ${outcome.status}`)
      known = outcome.known
      return outcome
    }
    const versions = () => [...files.keys()].filter((path) => path.startsWith(`${VAULT_VERSIONS_FOLDER}/`)).map((path) => path.split("/").pop()!).sort()
    await write("v1", 0)
    expect(versions()).toEqual([])
    await write("v2", 60_000)
    expect(versions()).toHaveLength(1)
    await write("v3", 120_000)
    expect(versions()).toHaveLength(1)
    // 7 h depois, mas a versão que está sendo substituída (v3) foi gravada 2 min depois da última cópia: não é guardada.
    await write("v4", 7 * HOUR)
    expect(versions()).toHaveLength(1)
    await write("v5", 7 * HOUR + 60_000)
    expect(versions()).toHaveLength(2)
    for (let index = 0; index < 10; index += 1) { await write(`a${index}`, (14 + index * 8) * HOUR); await write(`b${index}`, (14 + index * 8) * HOUR + 60_000) }
    expect(versions().length).toBeLessThanOrEqual(5)
  })

  it("o bestiário tem arquivo, revisão e histórico próprios", async () => {
    const { adapter, files } = memoryVault()
    const wiki = await saveVaultData(adapter, "knowledge", input(), context(null))
    const bestiary = await saveVaultData(adapter, "bestiary", input({ data: { entries: [] }, signature: "b", counts: { total: 4, entries: 4 } }), context(null))
    expect(wiki).toMatchObject({ status: "saved", header: { kind: "knowledge", revision: 1 } })
    expect(bestiary).toMatchObject({ status: "saved", header: { kind: "bestiary", revision: 1 } })
    expect([...files.keys()]).toEqual(expect.arrayContaining([VAULT_DATA_FILES.knowledge, VAULT_DATA_FILES.bestiary]))
  })
})

describe("ler o estado do arquivo", () => {
  it("distingue ausente, ilegível, de outro navegador e nosso", async () => {
    const { adapter } = memoryVault()
    expect(await inspectVaultData(adapter, "knowledge", null)).toEqual({ status: "missing" })
    const saved = await saveVaultData(adapter, "knowledge", input(), context(null, { writerId: "outro" }))
    if (saved.status !== "saved") throw new Error("esperava gravar")
    expect(await inspectVaultData(adapter, "knowledge", null)).toMatchObject({ status: "ok", ours: false, header: { writerId: "outro", counts: { total: 10 } } })
    expect(await inspectVaultData(adapter, "knowledge", saved.known)).toMatchObject({ status: "ok", ours: true })
    const broken = memoryVault({ [VAULT_DATA_FILES.knowledge]: "???" })
    expect(await inspectVaultData(broken.adapter, "knowledge", null)).toEqual({ status: "unreadable" })
    expect(await loadVaultData(broken.adapter, "knowledge")).toEqual({ status: "unreadable" })
    expect(await loadVaultData(memoryVault().adapter, "bestiary")).toEqual({ status: "missing" })
  })

  it("um cabeçalho maior que o começo lido ainda é entendido (leitura completa)", async () => {
    const preferences = { theme: "light" as const }
    const header: VaultDataHeader = { format: "runas-dm-vault-data", kind: "knowledge", version: 1, revision: 1, writerId: "w".repeat(9000), savedAt: 1, counts: { total: 1 }, contentHash: "h", preferences }
    const { adapter } = memoryVault({ [VAULT_DATA_FILES.knowledge]: serializeVaultData(header, "{}") })
    expect(await inspectVaultData(adapter, "knowledge", null)).toMatchObject({ status: "ok", header: { revision: 1 } })
  })
})
