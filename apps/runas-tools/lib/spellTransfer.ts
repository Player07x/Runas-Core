import type { CharacterSpell } from "@runas/core/types/character"
import { buildSpellListFile } from "@runas/core/lib/spellTransfer"
import { saveExportedJson } from "@/lib/fileExport"

export { parseImportedSpell, parseSpellListFile, type ImportedSpell } from "@runas/core/lib/spellTransfer"

function safeFilename(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "") || "personagem-runas"
}

export function exportSpellList(spells: CharacterSpell[], characterName: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  return saveExportedJson(buildSpellListFile(spells), `${safeFilename(characterName)}_magias.json`)
}
