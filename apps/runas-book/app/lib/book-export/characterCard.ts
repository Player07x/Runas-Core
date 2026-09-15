import { attributeGroups } from "@runas/core/data/attributes"
import { calculateCharacterStatSnapshot } from "@runas/core/lib/characterStatCalculations"
import type { Character } from "@runas/core/types/character"
import type { Block } from "./blocks"

type CardBlock = Extract<Block, { type: "card" }>

/** Monta o cartão de ficha exibido na exportação do livro, reaproveitando os grupos de atributos e os valores derivados oficiais do @runas/core — nunca recalculados aqui. */
export function characterCardBlock(character: Character): CardBlock {
  const snapshot = calculateCharacterStatSnapshot(character.attributes, character.info, character.stats, character.skills, character.abilities)
  const fields: { label: string; value: string }[] = [
    { label: "Raça", value: character.info.race || "—" },
    { label: "Classe", value: character.info.characterClass || "—" },
    { label: "Ofício", value: character.info.profession || "—" },
    { label: "Afinidade", value: character.info.affinity || "—" },
    { label: "PV máximo", value: String(snapshot.pvMax) },
    { label: "PA máximo", value: String(snapshot.paMax) },
    { label: "PE máximo", value: String(snapshot.peMax) },
    { label: "Deslocamento", value: String(snapshot.movement) },
  ]
  for (const group of attributeGroups) {
    fields.push({ label: group.primary.name, value: String(character.attributes[group.primary.key] ?? 0) })
    for (const attribute of group.attributes) fields.push({ label: attribute.name, value: String(character.attributes[attribute.key] ?? 0) })
  }
  return {
    type: "card",
    kind: "character",
    title: character.name || "Ficha sem nome",
    fields,
    portraitDataUrl: character.portraitDataUrl,
  }
}
