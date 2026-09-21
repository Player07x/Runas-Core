import { cronosAttributeMaximumsForCharacter } from "./normalization"
import { calculateSynchronization, deriveCronosScaleInfo } from "./calculations"
import { calculateItemSizeModifier } from "@runas/core/lib/characterCalculations"
import { CRONOS_ATTRIBUTE_KEYS, CRONOS_CHARACTER_VERSION, type CronosAttributeKey, type CronosCharacter, type CronosCharacterSaveFile, type CronosSkill } from "../types/character"

/** Lista de ids sem repetição, aceitando o campo único das fichas anteriores. */
function idList(value: unknown, legacy?: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof legacy === "string" && legacy.trim() ? [legacy] : []
  const ids: string[] = []
  for (const entry of source) {
    if (typeof entry !== "string") continue
    const id = entry.trim()
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function createCoreSkills(): CronosSkill[] {
  return [
    { id: "core-perception", name: "Percepção", attributeKey: "mind", points: 0, modifier: 0, locked: true },
    { id: "core-reflexes", name: "Reflexos", attributeKey: "dexterity", points: 0, modifier: -3, locked: true },
  ]
}

export function createEmptyCronosCharacter(): CronosCharacter {
  return {
    version: CRONOS_CHARACTER_VERSION,
    name: "",
    info: {
      currentYear: "7840",
      calendar: "al",
      race: "Humano",
      species: "",
      birthDate: "",
      age: "",
      region: "",
      archetype: "",
      synchronization: 1,
      synchronizationPoints: 0,
      attributePointMaximum: 35,
      deity: "",
      magicLevel: 1,
      evolution: false,
      sizeBase: "2.00",
      sizeReal: "2.00",
      sizeModifier: "0",
      sizeModifierBonus: "0",
      weightBase: "100",
      weightBonus: "0",
      weightReal: "100",
      scaleMultiplier: "1.0x",
      loadBase: "14",
    },
    attributes: { strength: 7, dexterity: 7, mind: 7, will: 7, spirit: 7 },
    synchronizationFiveAttribute: null,
    stats: {
      lifeCurrent: 7,
      lifeBonus: 0,
      manaCurrent: 7,
      manaBonus: 0,
      sanityCurrent: 7,
      sanityBonus: 0,
      auraEnabled: false,
      auraCurrent: 0,
      auraMaximum: 0,
      auraElementId: "none",
      resistances: [],
      weaknesses: [],
      effects: "",
      movementBonus: 0,
      currentLoad: 0,
      loadBonus: 0,
    },
    skills: createCoreSkills(),
    fame: [{ id: "core-fame", name: "", points: 0, locked: true }],
    abilities: [],
    spells: [],
    inventory: [],
    notes: [],
  }
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeCronosCharacter(partial: Partial<CronosCharacter> | undefined): CronosCharacter {
  const base = createEmptyCronosCharacter()
  if (!partial) return base
  const legacyInfo = (partial.info ?? {}) as Partial<CronosCharacter["info"]> & { memory?: unknown }
  const { memory: _removedMemory, ...persistedInfo } = legacyInfo
  let info = { ...base.info, ...persistedInfo }
  info.synchronizationPoints = Math.max(0, Math.trunc(number(info.synchronizationPoints)))
  info.synchronization = calculateSynchronization(info.synchronizationPoints)
  info.attributePointMaximum = Math.max(0, Math.trunc(number(info.attributePointMaximum, 35)))
  info.magicLevel = Math.max(0, Math.trunc(number(info.magicLevel, 1)))
  info.evolution = Boolean(info.evolution)
  const synchronizationFiveAttribute = partial.synchronizationFiveAttribute ?? null
  const maximums = cronosAttributeMaximumsForCharacter(info.synchronization, synchronizationFiveAttribute)
  const attributes = { ...base.attributes, ...(partial.attributes ?? {}) }
  for (const key of Object.keys(attributes) as (keyof typeof attributes)[]) {
    attributes[key] = Math.max(0, Math.min(maximums[key], Math.trunc(number(attributes[key], 7))))
  }
  info = deriveCronosScaleInfo(info, attributes.strength)
  const stats = { ...base.stats, ...(partial.stats ?? {}) }
  stats.auraEnabled = Boolean(stats.auraEnabled)
  stats.auraMaximum = Math.max(0, Math.trunc(number(stats.auraMaximum)))
  stats.auraCurrent = stats.auraEnabled ? Math.min(stats.auraMaximum, Math.max(0, Math.trunc(number(stats.auraCurrent)))) : 0
  const skills = (Array.isArray(partial.skills) ? partial.skills : base.skills).map((skill) => ({
    ...skill,
    attributeKey: CRONOS_ATTRIBUTE_KEYS.includes(skill.attributeKey as CronosAttributeKey) ? skill.attributeKey as CronosAttributeKey : "" as const,
    points: Math.max(0, Math.trunc(number(skill.points))),
    modifier: Math.trunc(number(skill.modifier)),
  }))
  const fame = Array.isArray(partial.fame) && partial.fame.length ? partial.fame : base.fame
  const normalizedName = typeof partial.name === "string" ? partial.name.slice(0, 80) : ""
  return {
    ...base,
    ...partial,
    version: CRONOS_CHARACTER_VERSION,
    name: normalizedName,
    info,
    attributes,
    synchronizationFiveAttribute,
    stats,
    skills,
    fame: fame.map((entry, index) => index === 0 ? { ...entry, id: "core-fame", name: normalizedName, locked: true } : entry),
    abilities: Array.isArray(partial.abilities) ? partial.abilities.map((ability) => {
      const legacy = ability as unknown as Record<string, unknown>
      return {
      ...ability,
      permanentModifiers: ability.permanentModifiers ?? "",
      costType: ability.costType ?? "none",
      costMode: ability.costMode ?? "fixed",
      costValue: ability.costValue ?? 0,
      costText: ability.costText ?? (legacy.cost == null ? "" : String(legacy.cost)),
    }}) : [],
    spells: Array.isArray(partial.spells) ? partial.spells.map((spell) => {
      const legacy = spell as unknown as Record<string, unknown>
      return {
      ...spell,
      costType: spell.costType === "paExtra" ? "pa" : spell.costType === "peTemporary" ? "pe" : (spell.costType ?? "none"),
      costMode: spell.costMode ?? "fixed",
      costValue: spell.costValue ?? 0,
      costText: spell.costText ?? (legacy.cost == null ? "" : String(legacy.cost)),
      magicType: spell.magicType ?? "spell",
      rangeType: spell.rangeType ?? "personal",
      rangeText: spell.rangeText ?? (legacy.range == null ? "" : String(legacy.range)),
      area: spell.area ?? "",
      castingSkill: spell.castingSkill ?? "",
    }}) : [],
    inventory: Array.isArray(partial.inventory) ? partial.inventory.map((item) => {
      const legacy = item as unknown as Record<string, unknown>
      return {
      ...item,
      type: item.type || "other",
      affinity: "affinity" in item ? item.affinity : 0,
      bondPoints: "bondPoints" in item ? item.bondPoints : 0,
      applyScaleWeight: "applyScaleWeight" in item ? item.applyScaleWeight : false,
      rdf: "rdf" in item ? item.rdf : 0,
      rdm: "rdm" in item ? item.rdm : 0,
      equippedAsArmor: "equippedAsArmor" in item ? item.equippedAsArmor : false,
      prCurrent: "prCurrent" in item ? item.prCurrent : null,
      prMaximum: "prMaximum" in item ? item.prMaximum : null,
      size: "size" in item ? item.size : 0,
      mt: calculateItemSizeModifier("size" in item ? item.size : 0),
      // Versão 3: encantamento e habilidade únicos viraram listas.
      abilityIds: idList(item.abilityIds, legacy.bondAbilityId ?? legacy.abilityId),
      spellIds: idList(item.spellIds, legacy.enchantmentSpellId),
      bondId: "bondId" in item ? item.bondId : "",
      skillId: item.skillId ?? "",
    }}) : [],
    notes: Array.isArray(partial.notes) ? partial.notes : [],
  }
}

export function parseCronosCharacterFile(raw: string): CronosCharacter {
  const parsed = JSON.parse(raw) as CronosCharacterSaveFile | Partial<CronosCharacter>
  const character = "character" in parsed ? parsed.character : parsed
  return normalizeCronosCharacter(character)
}
