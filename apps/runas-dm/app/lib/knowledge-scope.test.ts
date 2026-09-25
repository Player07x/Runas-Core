import { describe, expect, it } from "vitest"
import { createEmptyKnowledgeWorkspace, normalizeKnowledgeWorkspace } from "./knowledge-model"
import { describeStats } from "./snapshot-policy"
import { bestiaryStats, isPristineBestiary } from "./bestiary-scope"
import { isPristineKnowledge, knowledgeSignature, knowledgeSnapshotForStorage, knowledgeStats, pageBelongsToWorkspace } from "./knowledge-scope"
import { SAMPLE_ENTRY_IDS, createEmptyCharacter, createInitialState } from "./model"

function pageAt(id: string, obsidianPath: string) {
  return { id, scope: "wiki", kind: "geography", title: id, obsidianPath, createdAt: 1, updatedAt: 1 }
}

describe("escopo do que pode sair do dispositivo", () => {
  it("páginas rastreadas fora da Wiki e das Campanhas (Livro Vermelho, arquivo morto) nunca entram", () => {
    const state = normalizeKnowledgeWorkspace({
      pages: [
        pageAt("livro", "Runas Book/Livro Vermelho/Início/status.md"),
        pageAt("livro-hifen", "Runas-Book/Personagens/Martim.md"),
        pageAt("arquivo", "_Arquivo morto/Geografia/Regiões/Mar.md"),
        pageAt("solta", "Nota solta.md"),
        pageAt("sem-vault", ""),
        pageAt("wiki", "Personagens/Martim.md"),
        pageAt("legado", "Cronologia Geral/Era das Runas.md"),
        pageAt("campanha", "Campanhas/[O&C] Lion Heart pt. II/Anotações/Sessão 1.md"),
      ],
      updatedAt: 1,
    })
    expect(knowledgeSnapshotForStorage(state).pages.map((page) => page.id).sort()).toEqual(["campanha", "legado", "sem-vault", "wiki"])
    expect(state.pages.filter((page) => !pageBelongsToWorkspace(page)).map((page) => page.id).sort()).toEqual(["arquivo", "livro", "livro-hifen", "solta"])
  })

  it("devolve o mesmo objeto quando não há o que remover, e nunca altera o estado original", () => {
    const clean = normalizeKnowledgeWorkspace({ pages: [pageAt("wiki", "Personagens/Martim.md")], updatedAt: 1 })
    expect(knowledgeSnapshotForStorage(clean)).toBe(clean)
    const dirty = normalizeKnowledgeWorkspace({ pages: [pageAt("livro", "Runas Book/x.md")], updatedAt: 1 })
    knowledgeSnapshotForStorage(dirty)
    expect(dirty.pages).toHaveLength(1)
  })

  it("um dispositivo sem dado algum do mestre é virgem; qualquer coisa tira essa condição", () => {
    expect(isPristineKnowledge(createEmptyKnowledgeWorkspace())).toBe(true)
    for (const changed of [
      { pages: [pageAt("p", "")] },
      { campaigns: [{ id: "c", title: "C", createdAt: 1, updatedAt: 1 }] },
      { tags: [{ id: "t", name: "T", icon: "", color: "", pinnedIn: [] }] },
      { eras: [{ id: "runas", name: "Era das Runas" }] },
      { deletedIds: ["page-1"] },
    ]) {
      expect(isPristineKnowledge(normalizeKnowledgeWorkspace({ updatedAt: 1, ...changed })), JSON.stringify(changed)).toBe(false)
    }
  })

  it("as estatísticas somam páginas, campanhas e tags, e descrevem-se em português", () => {
    const state = normalizeKnowledgeWorkspace({
      campaigns: [{ id: "c", title: "C", createdAt: 1, updatedAt: 1 }],
      tags: [{ id: "t", name: "T", icon: "", color: "", pinnedIn: ["geography"] }],
      pages: [pageAt("a", ""), pageAt("b", "")],
      updatedAt: 1,
    })
    const stats = knowledgeStats(state)
    expect(stats).toMatchObject({ pages: 2, campaigns: 1 })
    expect(stats.total).toBe(stats.pages + stats.campaigns + stats.tags)
    expect(describeStats({ total: 5, pages: 2, campaigns: 1, tags: 2 })).toBe("2 páginas · 1 campanha · 2 tags")
    expect(describeStats({ total: 3, entries: 3 })).toBe("3 fichas")
    expect(describeStats({ total: 1 })).toBe("1 registro")
    expect(describeStats(null)).toBe("conteúdo desconhecido")
  })
})

describe("bestiário: dispositivo virgem", () => {
  it("as duas fichas de exemplo e as tabelas padrão significam que o bestiário ainda é de fábrica", () => {
    expect(createInitialState().entries.map((entry) => entry.id)).toEqual([...SAMPLE_ENTRY_IDS])
    expect(isPristineBestiary(createInitialState())).toBe(true)
    expect(isPristineBestiary({ ...createInitialState(), entries: [] })).toBe(true)
  })

  it("uma ficha do mestre ou uma tabela própria tira essa condição", () => {
    const initial = createInitialState()
    expect(isPristineBestiary({ ...initial, entries: [...initial.entries, { id: "sheet-1", character: createEmptyCharacter("Lobo"), masteryTableId: "default", updatedAt: 1 }] })).toBe(false)
    expect(isPristineBestiary({ ...initial, masteryTables: [...initial.masteryTables, { id: "custom", name: "Minha", multiplier: 3 }] })).toBe(false)
    expect(isPristineBestiary({ ...initial, masteryTables: [{ id: "default", name: "Padrão", multiplier: 2 }, initial.masteryTables[1]] })).toBe(false)
  })

  it("as estatísticas contam fichas e tabelas", () => {
    expect(bestiaryStats(createInitialState())).toEqual({ total: 2, entries: 2, tables: 2 })
  })
})

describe("assinatura do conteúdo", () => {
  const base = normalizeKnowledgeWorkspace({ pages: [pageAt("a", "Personagens/A.md")], campaigns: [{ id: "c", title: "[O&C] Lion Heart pt. II", createdAt: 1, updatedAt: 1 }], updatedAt: 1 })

  it("ignora as datas que a sincronização do vault reescreve a cada ciclo", () => {
    const resynced = { ...base, updatedAt: base.updatedAt + 30_000, pages: base.pages.map((page) => ({ ...page, obsidianModifiedAt: page.obsidianModifiedAt + 30_000, updatedAt: page.updatedAt + 5 })) }
    expect(knowledgeSignature(resynced)).toBe(knowledgeSignature(base))
  })

  it("muda quando o conteúdo muda: título, estilo da campanha, tag ou exclusão", () => {
    const signature = knowledgeSignature(base)
    expect(knowledgeSignature({ ...base, pages: base.pages.map((page) => ({ ...page, title: "Outro" })) })).not.toBe(signature)
    expect(knowledgeSignature({ ...base, campaigns: base.campaigns.map((campaign) => ({ ...campaign, accentColor: "#9987a3" })) })).not.toBe(signature)
    expect(knowledgeSignature({ ...base, deletedIds: ["page-9"] })).not.toBe(signature)
  })
})
