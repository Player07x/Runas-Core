import { describe, expect, it } from "vitest"
import { createInitialState, DEFAULT_BESTIARY_COLLECTION_ID, normalizeRunasDmState, type RunasDmState } from "./model"

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
