import { describe, expect, it } from "vitest"
import { adoptWikiCollection, applyCloudBackup, CAMPAIGN_STATUSES, chronologyEraPages, createDefaultWikiRegistry, createEmptyKnowledgeWorkspace, createKnowledgePage, createWikiCollection, DEFAULT_WIKI_COLLECTION_ID, mergeKnowledgeWorkspaces, normalizeKnowledgeWorkspace, normalizeWikiRegistry, parseList, removeWikiCollection, renameWikiCollection, wikiLinkTitles } from "./knowledge-model"

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
      ["fauna", "creatures", ["fauna"]],
      ["monsters", "creatures", ["monstros"]],
      ["session", "gm-note", ["sessões"]],
    ])
    expect(state.tags.map((tag) => tag.name).sort()).toEqual(["fauna", "monstros", "sessões"])
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
    expect(first.pages.find((page) => page.id === "person")?.tags).toContain("runilitas")
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

describe("nomes com colchetes no modelo", () => {
  it("reconhece vínculos para páginas cujo nome começa com colchete", () => {
    expect(wikiLinkTitles("Veja [[[O&C] Lion Heart]], [[[nome]]] e [[Zotera]].")).toEqual(["[O&C] Lion Heart", "[nome]", "Zotera"])
    expect(wikiLinkTitles("[[[O&C] Lion Heart pt. II (Campanha)|a campanha]] e [[[nome] Foo#Origem]]")).toEqual(["[O&C] Lion Heart pt. II (Campanha)", "[nome] Foo"])
  })

  it("não confunde texto solto com colchetes com um vínculo", () => {
    expect(wikiLinkTitles("[nome] resto, [outro] e [[ ]]")).toEqual([])
  })

  it("duas tags que só diferem na pontuação nunca compartilham o mesmo id", () => {
    const state = normalizeKnowledgeWorkspace({
      pages: [
        { id: "p1", scope: "wiki", kind: "geography", title: "A", tags: ["[O&C] Foo"], createdAt: 1, updatedAt: 1 },
        { id: "p2", scope: "wiki", kind: "geography", title: "B", tags: ["O&C Foo"], createdAt: 1, updatedAt: 1 },
      ],
    })
    expect(state.tags.map((tag) => tag.name).sort()).toEqual(["[o&c] foo", "o&c foo"])
    expect(new Set(state.tags.map((tag) => tag.id)).size).toBe(2)
    // Ids que já eram únicos não mudam: normalizar de novo devolve o mesmo resultado.
    expect(normalizeKnowledgeWorkspace(state).tags.map((tag) => tag.id)).toEqual(state.tags.map((tag) => tag.id))
  })
})

describe("anos das eras canônicas", () => {
  it("preenche as eras sem ano com os do documento e nunca sobrescreve o que o mestre editou", () => {
    const state = normalizeKnowledgeWorkspace({
      migrations: ["eras-documento-2026-09"],
      pages: [
        { id: "era-alquimistas", scope: "wiki", kind: "chronology", title: "Era dos Alquimistas", createdAt: 1, updatedAt: 1 },
        { id: "era-magos", scope: "wiki", kind: "chronology", title: "Era dos Magos", eraStartYear: 3000, eraEndYear: 3500, createdAt: 1, updatedAt: 1 },
        { id: "era-runas", scope: "wiki", kind: "chronology", title: "Era das Runas", createdAt: 1, updatedAt: 1 },
      ],
      updatedAt: 1,
    })
    const byId = (id: string) => state.pages.find((page) => page.id === id)
    expect(byId("era-alquimistas")).toMatchObject({ eraStartYear: 1489, eraEndYear: 3122 })
    expect(byId("era-magos")).toMatchObject({ eraStartYear: 3000, eraEndYear: 3500 })
    expect(byId("era-runas")?.eraStartYear ?? null).toBeNull()
  })
})

describe("identidade da wiki (collectionId)", () => {
  it("uma wiki nova já nasce com o id padrão", () => {
    expect(createEmptyKnowledgeWorkspace().collectionId).toBe(DEFAULT_WIKI_COLLECTION_ID)
  })

  it("normaliza um estado sem collectionId (dado legado) para o id padrão", () => {
    expect(normalizeKnowledgeWorkspace({ pages: [] }).collectionId).toBe(DEFAULT_WIKI_COLLECTION_ID)
  })

  it("preserva um collectionId já existente ao normalizar", () => {
    expect(normalizeKnowledgeWorkspace({ collectionId: "wiki-outra", pages: [] }).collectionId).toBe("wiki-outra")
  })

  it("mesclar nunca troca a identidade da wiki: o resultado segue sempre a local", () => {
    const local = { ...createEmptyKnowledgeWorkspace(), collectionId: "wiki-local", updatedAt: 5 }
    const remote = { ...createEmptyKnowledgeWorkspace(), collectionId: "wiki-remota", updatedAt: 10 }
    expect(mergeKnowledgeWorkspaces(local, remote).collectionId).toBe("wiki-local")
  })

  it("importar um backup da nuvem (mesclar ou substituir) nunca troca a identidade da wiki", () => {
    const local = { ...createEmptyKnowledgeWorkspace(), collectionId: "wiki-local" }
    const backup = { ...createEmptyKnowledgeWorkspace(), collectionId: "wiki-remota" }
    expect(applyCloudBackup(local, backup, "merge").collectionId).toBe("wiki-local")
    expect(applyCloudBackup(local, backup, "replace").collectionId).toBe("wiki-local")
  })
})

describe("registro de wikis", () => {
  it("um dispositivo novo começa só com a wiki padrão", () => {
    const registry = createDefaultWikiRegistry()
    expect(registry.collections).toEqual([expect.objectContaining({ id: DEFAULT_WIKI_COLLECTION_ID, name: "Wiki" })])
    expect(registry.activeCollectionId).toBe(DEFAULT_WIKI_COLLECTION_ID)
  })

  it("criar uma wiki nova gera um id próprio, mesmo com o mesmo nome", () => {
    const a = createWikiCollection("Ordem x Caos")
    const b = createWikiCollection("Ordem x Caos")
    expect(a.id).not.toBe(b.id)
    expect(a.name).toBe("Ordem x Caos")
  })

  it("normaliza um valor qualquer (dado legado, ausente) para o registro padrão, sem perder nada", () => {
    expect(normalizeWikiRegistry(null).collections).toHaveLength(1)
    expect(normalizeWikiRegistry(undefined).activeCollectionId).toBe(DEFAULT_WIKI_COLLECTION_ID)
  })

  it("preserva coleções válidas, descarta as malformadas e nunca fica com ids repetidos", () => {
    const registry = normalizeWikiRegistry({
      collections: [
        { id: "w1", name: "Ordem x Caos", createdAt: 1, updatedAt: 1 },
        { id: "w2", name: "Sagas de Cronos", createdAt: 2, updatedAt: 2 },
        { id: "w1", name: "Duplicata", createdAt: 3, updatedAt: 3 },
        { name: "Sem id" },
      ],
      activeCollectionId: "w2",
    })
    expect(registry.collections.map((collection) => collection.id)).toEqual(["w1", "w2"])
    expect(registry.activeCollectionId).toBe("w2")
  })

  it("uma coleção ativa que não existe mais cai na primeira coleção válida", () => {
    const registry = normalizeWikiRegistry({
      collections: [{ id: "w1", name: "Ordem x Caos", createdAt: 1, updatedAt: 1 }],
      activeCollectionId: "wiki-apagada",
    })
    expect(registry.activeCollectionId).toBe("w1")
  })

  it("renomeia sem trocar o id nem as demais coleções, e ignora um nome vazio", () => {
    const registry = normalizeWikiRegistry({
      collections: [{ id: "w1", name: "Ordem x Caos", createdAt: 1, updatedAt: 1 }, { id: "w2", name: "Valknut", createdAt: 2, updatedAt: 2 }],
      activeCollectionId: "w1",
    })
    const renamed = renameWikiCollection(registry, "w2", "Valknut Renovado", 99)
    expect(renamed.collections).toEqual([registry.collections[0], { id: "w2", name: "Valknut Renovado", createdAt: 2, updatedAt: 99 }])
    expect(renameWikiCollection(registry, "w2", "   ")).toBe(registry)
  })

  it("remove sem apagar dado algum (só tira do registro) e nunca remove a última wiki", () => {
    const registry = normalizeWikiRegistry({
      collections: [{ id: "w1", name: "Ordem x Caos", createdAt: 1, updatedAt: 1 }, { id: "w2", name: "Valknut", createdAt: 2, updatedAt: 2 }],
      activeCollectionId: "w2",
    })
    const removed = removeWikiCollection(registry, "w2")
    expect(removed.collections.map((collection) => collection.id)).toEqual(["w1"])
    // A ativa era a removida: a primeira que sobra assume.
    expect(removed.activeCollectionId).toBe("w1")
    const onlyOne = normalizeWikiRegistry({ collections: [{ id: "w1", name: "Única", createdAt: 1, updatedAt: 1 }], activeCollectionId: "w1" })
    expect(removeWikiCollection(onlyOne, "w1")).toBe(onlyOne)
  })

  it("adota uma wiki descoberta no diretório da nuvem preservando o id recebido", () => {
    const adopted = adoptWikiCollection("wiki-da-nuvem", "Ordem x Caos")
    expect(adopted).toEqual(expect.objectContaining({ id: "wiki-da-nuvem", name: "Ordem x Caos" }))
  })

  it("remover acrescenta uma lápide; normalizar preserva e deduplica as lápides existentes", () => {
    const registry = normalizeWikiRegistry({
      collections: [{ id: "w1", name: "Ordem x Caos", createdAt: 1, updatedAt: 1 }, { id: "w2", name: "Valknut", createdAt: 2, updatedAt: 2 }],
      activeCollectionId: "w2",
    })
    const removed = removeWikiCollection(registry, "w2")
    expect(removed.deletedCollectionIds).toEqual(["w2"])
    // Já removida: não há o que remover de novo, então nem duplica a lápide.
    expect(removeWikiCollection(removed, "w2")).toBe(removed)

    const normalized = normalizeWikiRegistry({ ...removed, deletedCollectionIds: ["w2", "w2", "w3", 42, ""] })
    expect(normalized.deletedCollectionIds).toEqual(["w2", "w3"])
  })
})
