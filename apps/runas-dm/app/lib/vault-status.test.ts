import { describe, expect, it } from "vitest"
import { knowledgeVaultInput } from "./knowledge-scope"
import { bestiaryVaultInput } from "./bestiary-scope"
import { normalizeKnowledgeWorkspace } from "./knowledge-model"
import { createInitialState, createEmptyCharacter } from "./model"
import { describeSaveOutcome } from "./vault-status"
import { VAULT_DATA_FILES, createVaultDataText, loadVaultData, parseVaultData, saveVaultData, type VaultDataAdapter, type VaultDataHeader } from "./vault-data"

const header: VaultDataHeader = { format: "runas-dm-vault-data", kind: "knowledge", version: 1, revision: 1, writerId: "w", savedAt: new Date(2026, 8, 24, 21, 5).getTime(), counts: { total: 3 }, contentHash: "h" }

describe("texto de status do vault", () => {
  it("cada resultado vira uma mensagem clara, e só pede ação quando o usuário precisa agir", () => {
    expect(describeSaveOutcome({ status: "no-vault" })).toEqual({ phase: "no-vault", message: "", attention: false })
    expect(describeSaveOutcome({ status: "permission" })).toMatchObject({ phase: "permission", attention: true })
    const saved = describeSaveOutcome({ status: "saved", header, known: { revision: 1, writerId: "w" }, checkpointed: false })
    expect(saved).toMatchObject({ phase: "saved", attention: false })
    expect(saved.message).toMatch(/dados salvos \(21:05\)/)
    expect(describeSaveOutcome({ status: "unchanged", header, known: { revision: 1, writerId: "w" } }).phase).toBe("saved")
    expect(describeSaveOutcome({ status: "skipped-pristine" })).toMatchObject({ phase: "empty", attention: false })
    for (const reason of ["foreign", "shrink", "unreadable"] as const) {
      const status = describeSaveOutcome({ status: "conflict", reason, existing: reason === "unreadable" ? null : header })
      expect(status, reason).toMatchObject({ phase: "conflict", attention: true })
      expect(status.message).toContain("nada foi sobrescrito")
    }
    expect(describeSaveOutcome({ status: "unsupported", version: 9 })).toMatchObject({ phase: "conflict", attention: true })
  })
})

describe("o que cada arquivo do vault guarda", () => {
  const campaign = { id: "c1", title: "[O&C] Lion Heart pt. II", createdAt: 1, updatedAt: 1, accentColor: "#9987a3" }

  it("Campanhas/Wiki: só o que é do Runas DM, com as preferências, e virgem quando não há nada", () => {
    const state = normalizeKnowledgeWorkspace({
      campaigns: [campaign],
      pages: [
        { id: "p1", scope: "wiki", kind: "geography", title: "Cidade", obsidianPath: "Geografia/Cidade.md", createdAt: 1, updatedAt: 1 },
        { id: "livro", scope: "wiki", kind: "event", title: "Status", obsidianPath: "Runas Book/Livro Vermelho/Início/status.md", createdAt: 1, updatedAt: 1 },
      ],
      updatedAt: 1,
    })
    const input = knowledgeVaultInput(state, { theme: "light" })
    expect((input.data as { pages: Array<{ id: string }> }).pages.map((page) => page.id)).toEqual(["p1"])
    expect(input).toMatchObject({ pristine: false, preferences: { theme: "light" }, counts: { pages: 1, campaigns: 1 } })
    expect(knowledgeVaultInput(normalizeKnowledgeWorkspace({}), {}).pristine).toBe(true)
  })

  it("a assinatura não muda com as datas que a sincronização reescreve", () => {
    const state = normalizeKnowledgeWorkspace({ campaigns: [campaign], updatedAt: 1 })
    expect(knowledgeVaultInput({ ...state, updatedAt: 999 }, {}).signature).toBe(knowledgeVaultInput(state, {}).signature)
  })

  it("Bestiário: fichas e tabelas, sem a Mesa, e virgem só com as fichas de exemplo", () => {
    const state = { ...createInitialState(), workspaceNotesHtml: "<p>segredo da mesa</p>", initiative: [{ id: "i", actorId: null, name: "Goblin", value: 3 }] }
    const input = bestiaryVaultInput(state)
    expect(JSON.stringify(input.data)).not.toContain("segredo da mesa")
    expect(input.pristine).toBe(true)
    const withSheet = bestiaryVaultInput({ ...state, entries: [...state.entries, { id: "sheet-1", character: createEmptyCharacter("Lobo"), masteryTableId: "default", updatedAt: 1 }] })
    expect(withSheet).toMatchObject({ pristine: false, counts: { entries: 3, total: 3 } })
    expect(bestiaryVaultInput({ ...state, updatedAt: 12345 }).signature).toBe(input.signature)
  })

  it("a exportação manual gera o mesmo formato do vault, e o vault a lê de volta", async () => {
    const state = normalizeKnowledgeWorkspace({ campaigns: [campaign], updatedAt: 1 })
    const text = createVaultDataText("knowledge", knowledgeVaultInput(state, { gridDensity: "large" }), { writerId: "exportado", now: 42 })
    const parsed = parseVaultData<{ campaigns: Array<{ title: string }> }>(text)
    expect(parsed?.header).toMatchObject({ kind: "knowledge", revision: 0, writerId: "exportado", savedAt: 42, preferences: { gridDensity: "large" } })
    expect(parsed?.data.campaigns[0].title).toBe("[O&C] Lion Heart pt. II")
    // Colocado em Runas DM/ à mão, é lido como qualquer arquivo do vault.
    const files = new Map([[VAULT_DATA_FILES.knowledge, text]])
    const adapter: VaultDataAdapter = { readText: async (path) => files.get(path) ?? null, readTextPrefix: async (path, bytes) => files.get(path)?.slice(0, bytes) ?? null, writeText: async (path, content) => { files.set(path, content) }, remove: async (path) => { files.delete(path) }, list: async () => [] }
    expect(await loadVaultData(adapter, "knowledge")).toMatchObject({ status: "ok", header: { writerId: "exportado" } })
    // E um dispositivo que nunca o viu não o sobrescreve com dados diferentes.
    expect(await saveVaultData(adapter, "knowledge", knowledgeVaultInput(normalizeKnowledgeWorkspace({ campaigns: [campaign, { ...campaign, id: "c2", title: "Outra" }], updatedAt: 1 }), {}), { writerId: "outro", known: null })).toMatchObject({ status: "conflict", reason: "foreign" })
  })
})
