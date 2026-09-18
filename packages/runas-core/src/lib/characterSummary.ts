import { CHARACTER_VERSION, type Character, type CharacterSaveFile } from "../types/character"
import { calculateCharacterStatSnapshot } from "./characterStatCalculations"

export interface ResourceSummaryBar {
  label: "PV" | "PA" | "PE"
  value: number
  max: number
}

/** Recursos de combate de uma ficha, com os máximos derivados das mesmas regras da ficha. */
export interface CharacterResourceSummary {
  name: string
  bars: ResourceSummaryBar[]
}

/**
 * Resumo usado por quem só exibe a ficha (ex.: barras dos tokens no
 * RunasVTT). Os máximos não ficam gravados em `Character`: são calculados
 * aqui por `calculateCharacterStatSnapshot`, como na própria ficha.
 */
export function summarizeCharacterResources(character: Character): CharacterResourceSummary {
  const snapshot = calculateCharacterStatSnapshot(character.attributes, character.info, character.stats, character.skills, character.abilities)
  return {
    name: character.name.trim() || "Sem nome",
    bars: [
      { label: "PV", value: character.stats.pv, max: snapshot.pvMax },
      { label: "PA", value: character.stats.pa, max: snapshot.paMax },
      { label: "PE", value: character.stats.pe, max: snapshot.peMax },
    ],
  }
}

/** Envelope versionado `{ version, character }`, o mesmo lido por `parseCharacterFile`. */
export function createCharacterSaveFile(character: Character): CharacterSaveFile {
  return { version: CHARACTER_VERSION, character }
}
