/**
 * Preferências de interface que hoje vivem só no `localStorage` do navegador.
 * Elas não pertencem à nuvem (que guarda apenas Bestiário, Campanhas e Wiki),
 * mas viajam com o vault: ao conectar o vault num computador novo, o tema, o
 * tamanho da grade e os demais ajustes voltam como estavam.
 *
 * As chaves ficam aqui, num lugar só, e os componentes as importam: assim o que
 * é gravado no vault nunca diverge do que a interface realmente lê.
 */

export const THEME_STORAGE_KEY = "runas-dm.theme"
export const GRID_DENSITY_STORAGE_KEY = "runas-dm.grid-density"
export const CHRONOLOGY_COLUMNS_STORAGE_KEY = "runas-dm.chronology-columns"
export const ITEM_EDITOR_MODE_STORAGE_KEY = "runas-dm:item-editor-mode"

export interface UiPreferences {
  theme?: "dark" | "light"
  gridDensity?: "small" | "medium" | "large"
  chronologyColumns?: 1 | 2 | 3
  itemEditorMode?: "simple" | "advanced"
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">

/** Só valores que a interface sabe ler: qualquer outra coisa (arquivo editado à mão, versão futura) é ignorada. */
export function parseUiPreferences(value: unknown): UiPreferences {
  if (!value || typeof value !== "object") return {}
  const record = value as Record<string, unknown>
  const preferences: UiPreferences = {}
  if (record.theme === "dark" || record.theme === "light") preferences.theme = record.theme
  if (record.gridDensity === "small" || record.gridDensity === "medium" || record.gridDensity === "large") preferences.gridDensity = record.gridDensity
  if (record.chronologyColumns === 1 || record.chronologyColumns === 2 || record.chronologyColumns === 3) preferences.chronologyColumns = record.chronologyColumns
  if (record.itemEditorMode === "simple" || record.itemEditorMode === "advanced") preferences.itemEditorMode = record.itemEditorMode
  return preferences
}

function read(storage: KeyValueStorage, key: string): string | null {
  try { return storage.getItem(key) } catch { return null }
}

/** Lê o que o usuário já escolheu neste navegador; o que nunca foi escolhido não entra. */
export function collectUiPreferences(storage: KeyValueStorage | null): UiPreferences {
  if (!storage) return {}
  const columns = read(storage, CHRONOLOGY_COLUMNS_STORAGE_KEY)
  return parseUiPreferences({
    theme: read(storage, THEME_STORAGE_KEY),
    gridDensity: read(storage, GRID_DENSITY_STORAGE_KEY),
    chronologyColumns: columns === null ? undefined : Number(columns),
    itemEditorMode: read(storage, ITEM_EDITOR_MODE_STORAGE_KEY),
  })
}

/** Grava nas mesmas chaves que a interface lê. Devolve o que foi de fato gravado, para a tela aplicar ao vivo. */
export function applyUiPreferences(preferences: UiPreferences, storage: KeyValueStorage | null): UiPreferences {
  if (!storage) return {}
  const valid = parseUiPreferences(preferences)
  const write = (key: string, value: string | number | undefined) => {
    if (value === undefined) return
    try { storage.setItem(key, String(value)) } catch { /* preferência opcional */ }
  }
  write(THEME_STORAGE_KEY, valid.theme)
  write(GRID_DENSITY_STORAGE_KEY, valid.gridDensity)
  write(CHRONOLOGY_COLUMNS_STORAGE_KEY, valid.chronologyColumns)
  write(ITEM_EDITOR_MODE_STORAGE_KEY, valid.itemEditorMode)
  return valid
}
