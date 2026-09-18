import type { CharacterAbility } from "@runas/core/types/character"
import { buildAbilityListFile } from "@runas/core/lib/abilityTransfer"
import { saveExportedJson } from "@/lib/fileExport"

export { parseAbilityListFile, type ImportedAbility } from "@runas/core/lib/abilityTransfer"

function safeFilename(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
  return normalized || "personagem-runas"
}

export function exportAbilityList(abilities: CharacterAbility[], characterName: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  return saveExportedJson(buildAbilityListFile(abilities), `${safeFilename(characterName)}_habilidades.json`)
}
