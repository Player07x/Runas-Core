import type {
  CharacterAbility,
  CharacterBond,
  CharacterInventoryItem,
  CharacterSkill,
  CharacterSpell,
} from "@runas/core/types/character"
import { buildInventoryListFile } from "@runas/core/lib/inventoryTransfer"
import { saveExportedJson } from "@/lib/fileExport"

export { parseInventoryListFile, type ImportedInventoryItem } from "@runas/core/lib/inventoryTransfer"

function safeFilename(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "") || "personagem-runas"
}

export function exportInventoryList(
  items: CharacterInventoryItem[],
  characterName: string,
  spells: CharacterSpell[],
  bonds: CharacterBond[],
  abilities: CharacterAbility[],
  skills: CharacterSkill[],
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  return saveExportedJson(buildInventoryListFile(items, spells, bonds, abilities, skills), `${safeFilename(characterName)}_inventario.json`)
}
