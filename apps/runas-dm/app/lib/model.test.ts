import { describe, expect, it } from "vitest"
import { adoptBestiaryCollection, createBestiaryCollection, createDefaultBestiaryRegistry, createEmptyRunasDmState, createInitialState, DEFAULT_BESTIARY_COLLECTION_ID, normalizeBestiaryRegistry, normalizeRunasDmState, removeBestiaryCollection, renameBestiaryCollection, type RunasDmState } from "./model"

describe("identidade do bestiário (collectionId)", () => {
  it("um bestiário novo já nasce com o id padrão", () => {
    expect(createInitialState().collectionId).toBe(DEFAULT_BESTIARY_COLLECTION_ID)
  })

  it("normaliza um estado sem collectionId (dado legado, backup antigo, importação) para o id padrão", () => {
    const legacy = { ...createInitialState() }
    delete legacy.collectionId
    expect(normalizeRunasDmState(legacy).collectionId).toBe(DEFAULT_BESTIARY_COLLECTION_ID)
  })

  it("preserva um collectionId já existente ao normalizar", () => {
    const state: RunasDmState = { ...createInitialState(), collectionId: "bestiario-outro" }
    expect(normalizeRunasDmState(state).collectionId).toBe("bestiario-outro")
  })

  it("ignora um collectionId vazio ou só com espaços, caindo no id padrão", () => {
    const state: RunasDmState = { ...createInitialState(), collectionId: "   " }
    expect(normalizeRunasDmState(state).collectionId).toBe(DEFAULT_BESTIARY_COLLECTION_ID)
  })
})

describe("registro de bestiários", () => {
  it("um dispositivo novo começa só com o bestiário padrão, em Livro Azul", () => {
    const registry = createDefaultBestiaryRegistry()
    expect(registry.collections).toEqual([expect.objectContaining({ id: DEFAULT_BESTIARY_COLLECTION_ID, system: "runas-blue" })])
    expect(registry.activeCollectionId).toBe(DEFAULT_BESTIARY_COLLECTION_ID)
  })

  it("criar um bestiário novo escolhe o sistema e gera um id próprio", () => {
    const a = createBestiaryCollection("Sagas de Cronos — feras", "cronos")
    const b = createBestiaryCollection("Sagas de Cronos — feras", "cronos")
    expect(a.system).toBe("cronos")
    expect(a.name).toBe("Sagas de Cronos — feras")
    expect(a.id).not.toBe(b.id)
  })

  it("normaliza um valor qualquer (dado legado, ausente) para o registro padrão, sem perder nada", () => {
    expect(normalizeBestiaryRegistry(null).collections).toHaveLength(1)
    expect(normalizeBestiaryRegistry(undefined).activeCollectionId).toBe(DEFAULT_BESTIARY_COLLECTION_ID)
  })

  it("preserva coleções válidas, descarta as malformadas e nunca fica com ids repetidos", () => {
    const registry = normalizeBestiaryRegistry({
      collections: [
        { id: "b1", name: "Feras da Floresta", system: "runas-blue", createdAt: 1, updatedAt: 1 },
        { id: "b2", name: "Sagas de Cronos", system: "cronos", createdAt: 2, updatedAt: 2 },
        { id: "b1", name: "Duplicata", system: "runas-blue", createdAt: 3, updatedAt: 3 },
        { name: "Sem id" },
        "não é objeto",
      ],
      activeCollectionId: "b2",
    })
    expect(registry.collections.map((collection) => collection.id)).toEqual(["b1", "b2"])
    expect(registry.activeCollectionId).toBe("b2")
  })

  it("uma coleção ativa que não existe mais cai na primeira coleção válida, sem travar a interface", () => {
    const registry = normalizeBestiaryRegistry({
      collections: [{ id: "b1", name: "Feras", system: "runas-blue", createdAt: 1, updatedAt: 1 }],
      activeCollectionId: "coleção-apagada",
    })
    expect(registry.activeCollectionId).toBe("b1")
  })

  it("um registro sem nenhuma coleção válida nunca fica vazio: volta ao padrão", () => {
    expect(normalizeBestiaryRegistry({ collections: [{ name: "sem id" }] }).collections).toHaveLength(1)
  })

  it("renomeia sem trocar o id nem as demais coleções, e ignora um nome vazio", () => {
    const registry = normalizeBestiaryRegistry({
      collections: [{ id: "b1", name: "Feras", system: "runas-blue", createdAt: 1, updatedAt: 1 }, { id: "b2", name: "Sagas de Cronos", system: "cronos", createdAt: 2, updatedAt: 2 }],
      activeCollectionId: "b1",
    })
    const renamed = renameBestiaryCollection(registry, "b2", "Sagas de Cronos — feras", 99)
    expect(renamed.collections).toEqual([registry.collections[0], { id: "b2", name: "Sagas de Cronos — feras", system: "cronos", createdAt: 2, updatedAt: 99 }])
    expect(renameBestiaryCollection(registry, "b2", "   ")).toBe(registry)
  })

  it("remove sem apagar dado algum (só tira do registro) e nunca remove o último bestiário", () => {
    const registry = normalizeBestiaryRegistry({
      collections: [{ id: "b1", name: "Feras", system: "runas-blue", createdAt: 1, updatedAt: 1 }, { id: "b2", name: "Sagas de Cronos", system: "cronos", createdAt: 2, updatedAt: 2 }],
      activeCollectionId: "b2",
    })
    const removed = removeBestiaryCollection(registry, "b2")
    expect(removed.collections.map((collection) => collection.id)).toEqual(["b1"])
    expect(removed.activeCollectionId).toBe("b1")
    const onlyOne = normalizeBestiaryRegistry({ collections: [{ id: "b1", name: "Único", system: "runas-blue", createdAt: 1, updatedAt: 1 }], activeCollectionId: "b1" })
    expect(removeBestiaryCollection(onlyOne, "b1")).toBe(onlyOne)
  })

  it("adota um bestiário descoberto no diretório da nuvem preservando o id e o sistema recebidos", () => {
    const adopted = adoptBestiaryCollection("bestiario-da-nuvem", "Sagas de Cronos", "cronos")
    expect(adopted).toEqual(expect.objectContaining({ id: "bestiario-da-nuvem", name: "Sagas de Cronos", system: "cronos" }))
  })

  it("remover acrescenta uma lápide; normalizar preserva e deduplica as lápides existentes", () => {
    const registry = normalizeBestiaryRegistry({
      collections: [{ id: "b1", name: "Feras", system: "runas-blue", createdAt: 1, updatedAt: 1 }, { id: "b2", name: "Sagas de Cronos", system: "cronos", createdAt: 2, updatedAt: 2 }],
      activeCollectionId: "b2",
    })
    const removed = removeBestiaryCollection(registry, "b2")
    expect(removed.deletedCollectionIds).toEqual(["b2"])
    // Já removido: não há o que remover de novo, então nem duplica a lápide.
    expect(removeBestiaryCollection(removed, "b2")).toBe(removed)

    const normalized = normalizeBestiaryRegistry({ ...removed, deletedCollectionIds: ["b2", "b2", "b3", 42, ""] })
    expect(normalized.deletedCollectionIds).toEqual(["b2", "b3"])
  })
})

describe("bestiário novo, criado pelo mestre", () => {
  it("começa vazio, sem as duas fichas de exemplo do bestiário padrão", () => {
    const state = createEmptyRunasDmState("bestiario-cronos")
    expect(state.collectionId).toBe("bestiario-cronos")
    expect(state.entries).toEqual([])
    expect(state.masteryTables.length).toBeGreaterThan(0)
  })
})
