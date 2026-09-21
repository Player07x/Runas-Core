import type { Character, SecondaryAttributeKey } from "../types/character"
import { availableElementFusions, calculateElementTest, elementSkillName, normalizeElementName } from "./elementSkills"
import { calculateAttributeTest, calculateSkillModifier, normalizeSkillName } from "./skillCalculations"

/**
 * Tudo que a ficha aceita onde pede "uma perícia": as perícias em si e os
 * elementos da seção de Magias, inclusive as fusões derivadas deles. Um item
 * ou uma magia guarda apenas o `id`; quem rola resolve por aqui.
 */
export type CharacterTestSourceKind = "skill" | "element" | "fusion"

export interface CharacterTestSource {
  id: string
  name: string
  kind: CharacterTestSourceKind
  /** Valor final do teste, já com os atributos da ficha. */
  test: number
  /** Atributo secundário do teste. Elementos e fusões usam Poder (Místico + Poder). */
  attributeKey: SecondaryAttributeKey | ""
  /** O que se soma ao atributo: nível + modificador da perícia, ou o nível do elemento. */
  modifier: number
}

/** Prefixo dos ids de fusão: elas não existem como registro, são derivadas dos elementos. */
export const FUSION_ID_PREFIX = "fusion:"

export function listCharacterTestSources(character: Pick<Character, "attributes" | "skills" | "elements">): CharacterTestSource[] {
  const skills = character.skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    kind: "skill" as const,
    test: skill.attributeKey ? calculateAttributeTest(character.attributes, skill.attributeKey) + calculateSkillModifier(skill) : 0,
    attributeKey: skill.attributeKey,
    modifier: calculateSkillModifier(skill),
  }))
  const elements = (character.elements ?? []).map((element) => ({
    id: element.id,
    name: elementSkillName(element),
    kind: "element" as const,
    test: calculateElementTest(character.attributes, element.level),
    attributeKey: "power" as const,
    modifier: Math.max(0, Math.trunc(element.level)),
  }))
  const fusions = availableElementFusions(character.elements ?? []).map((fusion) => ({
    id: `${FUSION_ID_PREFIX}${fusion.element.id}`,
    name: fusion.element.name,
    kind: "fusion" as const,
    test: calculateElementTest(character.attributes, fusion.level),
    attributeKey: "power" as const,
    modifier: fusion.level,
  }))
  return [...skills, ...elements, ...fusions]
}

/** Resolve por `id` e, para quem guarda só o nome (`castingSkill`), também por nome. */
export function findCharacterTestSource(
  character: Pick<Character, "attributes" | "skills" | "elements">,
  idOrName: string,
): CharacterTestSource | undefined {
  const wanted = idOrName.trim()
  if (!wanted) return undefined
  const sources = listCharacterTestSources(character)
  const byId = sources.find((source) => source.id === wanted)
  if (byId) return byId
  const skillName = normalizeSkillName(wanted)
  const elementName = normalizeElementName(wanted)
  return sources.find((source) => normalizeSkillName(source.name) === skillName || normalizeElementName(source.name) === elementName)
}
