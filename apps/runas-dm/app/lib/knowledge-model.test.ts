import { describe, expect, it } from "vitest"
import { applyCloudBackup, CAMPAIGN_STATUSES, chronologyEraPages, createEmptyKnowledgeWorkspace, createKnowledgePage, mergeKnowledgeWorkspaces, normalizeKnowledgeWorkspace, parseList, wikiLinkTitles } from "./knowledge-model"

describe("knowledge model", () => {
  it("mantém os status definidos pelo produto e normaliza referências de encontro", () => {
    expect(CAMPAIGN_STATUSES).toEqual([
      "Sem Status",
      "Não Iniciada",
      "Em Progresso",
      "Concluída",
      "Fracassada",
      "Parcialmente Concluída",
      "Parcialmente Fracassada",
    ])
    const state = normalizeKnowledgeWorkspace({
      pages: [{
        id: "page-1",
        kind: "encounter",
        status: "status inválido",
        encounterCreatures: [
          { entryId: "wolf", name: "Lobo", quantity: 120 },
          { entryId: "crow", name: "Corvo", quantity: 0 },
        ],
      }],
    })
    expect(state.pages[0].status).toBe("Sem Status")
    expect(state.pages[0].encounterCreatures.map((item) => item.quantity)).toEqual([99, 1])
    expect(createKnowledgePage("campaign", "encounter", "campaign-1").title).toBe("Novo encontro")
  })

  it("deduplica filtros e encontra links no formato do Obsidian", () => {
    expect(parseList("vilão, sessão 4, vilão\nreino")).toEqual(["vilão", "sessão 4", "reino"])
    expect(wikiLinkTitles("[[Zotera]] e [[A Queda|evento]], além de [[Zotera#Origem]]")).toEqual(["Zotera", "A Queda", "Zotera"])
  })

  it("mescla snapshots sem apagar registros exclusivos", () => {
    const local = normalizeKnowledgeWorkspace({
      updatedAt: 10,
      campaigns: [{ id: "local", title: "Local", createdAt: 1, updatedAt: 10 }],
    })
    const remote = normalizeKnowledgeWorkspace({
      updatedAt: 20,
      campaigns: [{ id: "remote", title: "Remota", createdAt: 2, updatedAt: 20 }],
    })
    expect(mergeKnowledgeWorkspaces(local, remote).campaigns.map((campaign) => campaign.id).sort()).toEqual(["local", "remote"])
  })

  it("preserva uma edição de aparência mais recente sobre um instantâneo de sincronização mais antigo", () => {
    // A sincronização com o Obsidian lê o vault inteiro antes de terminar; se o
    // mestre trocar a imagem da campanha em Estilo durante essa janela, o
    // resultado da sincronização (baseado num instantâneo anterior à troca) não
    // pode sobrescrever a edição mais nova.
    const beforeSync = normalizeKnowledgeWorkspace({
      updatedAt: 10,
      campaigns: [{ id: "campaign-1", title: "Lion Heart", createdAt: 1, updatedAt: 10, backgroundImageDataUrl: "" }],
    })
    const editedDuringSync = normalizeKnowledgeWorkspace({
      updatedAt: 20,
      campaigns: [{ id: "campaign-1", title: "Lion Heart", createdAt: 1, updatedAt: 20, backgroundImageDataUrl: "data:image/webp;base64,AAA" }],
    })
    const syncResult = normalizeKnowledgeWorkspace({
      updatedAt: 15,
      campaigns: [{ ...beforeSync.campaigns[0] }],
    })
    const merged = mergeKnowledgeWorkspaces(editedDuringSync, syncResult)
    expect(merged.campaigns.find((campaign) => campaign.id === "campaign-1")?.backgroundImageDataUrl).toBe("data:image/webp;base64,AAA")
  })

  it("respeita a lápide de exclusão: um registro apagado localmente não volta por um snapshot remoto mais antigo", () => {
    const local = normalizeKnowledgeWorkspace({
      updatedAt: 20,
      campaigns: [],
      deletedIds: ["campaign-1"],
    })
    const remote = normalizeKnowledgeWorkspace({
      updatedAt: 10,
      campaigns: [{ id: "campaign-1", title: "Lion Heart", createdAt: 1, updatedAt: 10 }],
    })
    const merged = mergeKnowledgeWorkspaces(local, remote)
    expect(merged.campaigns).toHaveLength(0)
    expect(merged.deletedIds).toContain("campaign-1")
  })

  it("descarta um registro já apagado ao normalizar, mesmo vindo de um estado bruto", () => {
    const state = normalizeKnowledgeWorkspace({
      deletedIds: ["campaign-1", "page-1"],
      campaigns: [{ id: "campaign-1", title: "Lion Heart", createdAt: 1, updatedAt: 1 }],
      pages: [{ id: "page-1", kind: "mission" }, { id: "page-2", kind: "mission" }],
    })
    expect(state.campaigns).toHaveLength(0)
    expect(state.pages.map((page) => page.id)).toEqual(["page-2"])
  })

  it("importação manual 'Sincronizar' reescreve com o backup, cria o que só existe nele e preserva o que só existe local", () => {
    const local = normalizeKnowledgeWorkspace({
      updatedAt: 10,
      campaigns: [
        { id: "shared", title: "Versão local", createdAt: 1, updatedAt: 10 },
        { id: "local-only", title: "Só local", createdAt: 1, updatedAt: 10 },
      ],
    })
    const backup = normalizeKnowledgeWorkspace({
      updatedAt: 5,
      campaigns: [
        { id: "shared", title: "Versão do backup", createdAt: 1, updatedAt: 5 },
        { id: "backup-only", title: "Só no backup", createdAt: 1, updatedAt: 5 },
      ],
    })
    const merged = applyCloudBackup(local, backup, "merge")
    expect(merged.campaigns.find((campaign) => campaign.id === "shared")?.title).toBe("Versão do backup")
    expect(merged.campaigns.map((campaign) => campaign.id).sort()).toEqual(["backup-only", "local-only", "shared"])
  })

  it("importação manual 'Sincronizar' não ressuscita um registro já apagado localmente", () => {
    const local = normalizeKnowledgeWorkspace({ updatedAt: 10, campaigns: [], deletedIds: ["campaign-1"] })
    const backup = normalizeKnowledgeWorkspace({
      updatedAt: 5,
      campaigns: [{ id: "campaign-1", title: "Lion Heart", createdAt: 1, updatedAt: 5 }],
    })
    const merged = applyCloudBackup(local, backup, "merge")
    expect(merged.campaigns).toHaveLength(0)
    expect(merged.deletedIds).toContain("campaign-1")
  })

  it("importação manual 'Substituir tudo' descarta o que só existe localmente", () => {
    const local = normalizeKnowledgeWorkspace({
      updatedAt: 10,
      campaigns: [{ id: "local-only", title: "Só local", createdAt: 1, updatedAt: 10 }],
    })
    const backup = normalizeKnowledgeWorkspace({
      updatedAt: 5,
      campaigns: [{ id: "backup-only", title: "Só no backup", createdAt: 1, updatedAt: 5 }],
    })
    const replaced = applyCloudBackup(local, backup, "replace")
    expect(replaced.campaigns.map((campaign) => campaign.id)).toEqual(["backup-only"])
  })

  it("migra Fauna, Monstros e Sessões para os tipos e tags v3", () => {
    const state = normalizeKnowledgeWorkspace({ version: 2, pages: [
      { id: "fauna", scope: "wiki", kind: "fauna", title: "Lobo", tags: [], categoryIds: [] },
      { id: "monsters", scope: "wiki", kind: "monsters", title: "Dragão", tags: [], categoryIds: [] },
      { id: "session", scope: "campaign", campaignId: "c", kind: "session-note", title: "Sessão 1", tags: [], categoryIds: [] },
    ] })
    expect(state.version).toBe(3)
    expect(state.pages.map((page) => [page.id, page.kind, page.tags])).toEqual([
      ["fauna", "creatures", ["Fauna"]],
      ["monsters", "creatures", ["Monstros"]],
      ["session", "gm-note", ["Sessões"]],
    ])
    expect(state.tags.map((tag) => tag.name).sort()).toEqual(["Fauna", "Monstros", "Sessões"])
  })

  it("começa sem eras pré-criadas e preserva eras configuradas pelo mestre", () => {
    const empty = createEmptyKnowledgeWorkspace()
    expect(empty.pages).toHaveLength(0)
    expect(empty.eras).toHaveLength(0)
    expect(chronologyEraPages(empty)).toHaveLength(0)
    const configured = normalizeKnowledgeWorkspace({ ...empty, eras: [{ id: "pre-runas", name: "Pré-Runas", startYear: null, endYear: null, calendar: "C.E." }] })
    const projected = chronologyEraPages(configured)
    expect(projected).toHaveLength(1)
    expect(projected.map((page) => page.title)).toContain("Pré-Runas")
    expect(projected.map((page) => page.title)).not.toContain("Era dos Titãs")
    const edited = { ...projected.find((page) => page.id === "era-pre-runas")!, title: "Era dos Sábios", eraEndYear: 1500 }
    const restored = normalizeKnowledgeWorkspace({ ...empty, pages: [edited], deletedIds: ["era-magos"] })
    expect(restored.pages).toHaveLength(1)
    expect(chronologyEraPages(restored)).toHaveLength(1)
    expect(chronologyEraPages(restored).find((page) => page.id === "era-pre-runas")).toMatchObject({ title: "Era dos Sábios", eraEndYear: 1500 })
    expect(chronologyEraPages(restored).some((page) => page.id === "era-magos")).toBe(false)
  })

  it("migra categorias antigas para tags e cria páginas de era uma única vez", () => {
    const input = { version: 2, eras: [{ id: "monges", name: "Monges", startYear: 0, endYear: 1489, calendar: "C.E." }], categories: [{ id: "cat", scope: "wiki", campaignId: null, name: "Runilitas", parentId: null }], pages: [{ id: "person", scope: "wiki", kind: "characters", title: "Martim", categoryIds: ["cat"], tags: [], eventYear: 100 }] }
    const first = normalizeKnowledgeWorkspace(input)
    expect(first.pages.find((page) => page.id === "person")?.tags).toContain("Runilitas")
    expect(first.pages.some((page) => page.id === "era-monges" && page.kind === "chronology")).toBe(true)
    const second = normalizeKnowledgeWorkspace(first)
    expect(second.pages.map((page) => page.id)).toEqual(first.pages.map((page) => page.id))
    expect(second.tags.map((tag) => tag.id)).toEqual(first.tags.map((tag) => tag.id))
  })

  it("transforma uma cronologia avulsa em acontecimento e preserva lápides", () => {
    const state = normalizeKnowledgeWorkspace({ version: 2, deletedIds: ["deleted"], pages: [{ id: "deleted", kind: "chronology", title: "apagada" }, { id: "loose", scope: "wiki", kind: "chronology", title: "Acontecimento avulso", eraId: "monges", eventYear: 42 }] })
    expect(state.deletedIds).toEqual(["deleted"])
    expect(state.pages.find((page) => page.id === "deleted")).toBeUndefined()
    expect(state.pages.find((page) => page.id === "loose")?.kind).toBe("event")
  })

  it("normaliza vínculos de Mundo e o Organizador sem aceitar arestas órfãs", () => {
    const normalized = normalizeKnowledgeWorkspace({ campaigns: [{ id: "camp", title: "Campanha", worldPageIds: ["world"], organizer: { nodes: [{ id: "n1", title: "Pista", body: "Texto", x: 10, y: 20 }], edges: [{ id: "valid", fromId: "n1", toId: "n1" }, { id: "orphan", fromId: "n1", toId: "missing" }] } }] })
    expect(normalized.campaigns[0].worldPageIds).toEqual(["world"])
    expect(normalized.campaigns[0].organizer).toMatchObject({ nodes: [{ id: "n1" }], edges: [{ id: "valid" }] })
  })
})
