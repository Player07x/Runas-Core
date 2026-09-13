import { describe, expect, it } from "vitest"
import { CAMPAIGN_STATUSES, createKnowledgePage, mergeKnowledgeWorkspaces, normalizeKnowledgeWorkspace, parseList, wikiLinkTitles } from "./knowledge-model"

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
})
