import { describe, expect, it } from "vitest"
import { CHRONOLOGY_COLUMNS_STORAGE_KEY, GRID_DENSITY_STORAGE_KEY, ITEM_EDITOR_MODE_STORAGE_KEY, THEME_STORAGE_KEY, applyUiPreferences, collectUiPreferences, parseUiPreferences } from "./ui-preferences"

function storageWith(values: Record<string, string> = {}) {
  const map = new Map(Object.entries(values))
  return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, String(value)) } }
}

describe("preferências de interface que viajam com o vault", () => {
  it("lê só o que o usuário já escolheu neste navegador", () => {
    expect(collectUiPreferences(storageWith())).toEqual({})
    expect(collectUiPreferences(storageWith({ [THEME_STORAGE_KEY]: "light", [GRID_DENSITY_STORAGE_KEY]: "large", [CHRONOLOGY_COLUMNS_STORAGE_KEY]: "3", [ITEM_EDITOR_MODE_STORAGE_KEY]: "advanced" }))).toEqual({ theme: "light", gridDensity: "large", chronologyColumns: 3, itemEditorMode: "advanced" })
  })

  it("ignora valores que a interface não sabe ler", () => {
    expect(collectUiPreferences(storageWith({ [THEME_STORAGE_KEY]: "roxo", [GRID_DENSITY_STORAGE_KEY]: "enorme", [CHRONOLOGY_COLUMNS_STORAGE_KEY]: "7", [ITEM_EDITOR_MODE_STORAGE_KEY]: "" }))).toEqual({})
    expect(parseUiPreferences({ theme: "dark", extra: 1, chronologyColumns: "2" })).toEqual({ theme: "dark" })
    expect(parseUiPreferences(null)).toEqual({})
    expect(parseUiPreferences("texto")).toEqual({})
  })

  it("grava nas mesmas chaves que a interface lê, e devolve o que foi aplicado", () => {
    const storage = storageWith()
    const applied = applyUiPreferences({ theme: "light", gridDensity: "small", chronologyColumns: 2, itemEditorMode: "simple" }, storage)
    expect(applied).toEqual({ theme: "light", gridDensity: "small", chronologyColumns: 2, itemEditorMode: "simple" })
    expect(Object.fromEntries(storage.map)).toEqual({ [THEME_STORAGE_KEY]: "light", [GRID_DENSITY_STORAGE_KEY]: "small", [CHRONOLOGY_COLUMNS_STORAGE_KEY]: "2", [ITEM_EDITOR_MODE_STORAGE_KEY]: "simple" })
    expect(collectUiPreferences(storage)).toEqual(applied)
  })

  it("nunca grava valor inválido nem apaga o que não veio no arquivo", () => {
    const storage = storageWith({ [THEME_STORAGE_KEY]: "dark" })
    applyUiPreferences({ gridDensity: "gigante" } as never, storage)
    expect(Object.fromEntries(storage.map)).toEqual({ [THEME_STORAGE_KEY]: "dark" })
  })

  it("sem armazenamento (ou com armazenamento que falha) nada quebra", () => {
    expect(collectUiPreferences(null)).toEqual({})
    expect(applyUiPreferences({ theme: "light" }, null)).toEqual({})
    const broken = { getItem() { throw new Error("bloqueado") }, setItem() { throw new Error("bloqueado") } }
    expect(collectUiPreferences(broken)).toEqual({})
    expect(() => applyUiPreferences({ theme: "light" }, broken)).not.toThrow()
  })
})
