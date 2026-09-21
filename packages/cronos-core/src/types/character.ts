export const CRONOS_CHARACTER_VERSION = 3

export const CRONOS_ATTRIBUTE_KEYS = ["strength", "dexterity", "mind", "will", "spirit"] as const
export type CronosAttributeKey = (typeof CRONOS_ATTRIBUTE_KEYS)[number]
export type CronosAttributes = Record<CronosAttributeKey, number>
export type CronosSynchronization = 1 | 2 | 3 | 4 | 5

export interface CronosCharacterInfo {
  currentYear: string
  calendar: "al"
  race: string
  species: string
  birthDate: string
  age: string
  region: string
  archetype: string
  synchronization: CronosSynchronization
  synchronizationPoints: number
  attributePointMaximum: number
  deity: string
  magicLevel: number
  evolution: boolean
  sizeBase: string
  sizeReal: string
  sizeModifier: string
  sizeModifierBonus: string
  weightBase: string
  weightBonus: string
  weightReal: string
  scaleMultiplier: string
  loadBase: string
}

export interface CronosStats {
  lifeCurrent: number
  lifeBonus: number
  manaCurrent: number
  manaBonus: number
  sanityCurrent: number
  sanityBonus: number
  auraEnabled: boolean
  auraCurrent: number
  auraMaximum: number
  auraElementId: string
  resistances: string[]
  weaknesses: string[]
  effects: string
  movementBonus: number
  currentLoad: number
  loadBonus: number
}

export interface CronosSkill {
  id: string
  name: string
  attributeKey: CronosAttributeKey | ""
  points: number
  modifier: number
  locked: boolean
}

export type CronosFameScope = "local" | "municipal" | "state" | "federal" | "continental" | "global"
export type CronosFameLevel = "Esquecido" | "Desconhecido" | "Conhecido" | "Adorado" | "Venerado"

export interface CronosFame {
  id: string
  name: string
  points: number
  locked: boolean
}

export type CronosAbilityCostType = "none" | "other" | "pv" | "pa" | "pe" | "paExtra" | "peTemporary"
export type CronosAbilityCostMode = "fixed" | "relative"

export interface CronosAbility {
  id: string
  category: string
  name: string
  description: string
  permanentModifiers: string
  costType: CronosAbilityCostType
  costMode: CronosAbilityCostMode
  costValue: number
  costText: string
}

export type CronosSpellMagicType = "aura" | "quick" | "spell" | "ritual" | "enchantment"
export type CronosSpellRangeType = "touch" | "personal" | "projectile" | "targets" | "area"

export interface CronosSpell extends Omit<CronosAbility, "permanentModifiers"> {
  magicType: CronosSpellMagicType
  rangeType: CronosSpellRangeType
  rangeText: string
  area: string
  duration: string
  castingSkill: string
}

export type CronosInventoryUsage = "equipped" | "stored" | "absent"
export type CronosInventoryItemType = "innate" | "weapon" | "armor" | "shield" | "artifact" | "material" | "consumable" | "tool" | "utility" | "accessory" | "currency" | "other"

export interface CronosInventoryItem {
  id: string
  usage: CronosInventoryUsage
  name: string
  type: CronosInventoryItemType
  affinity: 0 | 1 | 2 | 3 | 4
  bondPoints: number
  baseWeight: number
  /** Comprimento em centímetros; o MT vem dele, como no Livro Azul. */
  size: number
  mt: number
  quantity: number
  applyScaleWeight: boolean
  damage: string
  rdf: number
  rdm: number
  equippedAsArmor: boolean
  prCurrent: number | null
  prMaximum: number | null
  /** Habilidades e magias anexadas ao item, desde a versão 3. */
  abilityIds: string[]
  spellIds: string[]
  bondId: string
  skillId: string
  description: string
}

export interface CronosNote {
  id: string
  category: string
  name: string
  description: string
  date: string
}

export interface CronosCharacter {
  version: number
  name: string
  portraitDataUrl?: string
  info: CronosCharacterInfo
  attributes: CronosAttributes
  synchronizationFiveAttribute: CronosAttributeKey | null
  stats: CronosStats
  skills: CronosSkill[]
  fame: CronosFame[]
  abilities: CronosAbility[]
  spells: CronosSpell[]
  inventory: CronosInventoryItem[]
  notes: CronosNote[]
}

export interface CronosCharacterSaveFile {
  version: number
  character: CronosCharacter
}

export interface CronosCharacterGalleryEntry {
  id: string
  character: CronosCharacter
  updatedAt: number
}

export interface CronosCharacterGallery {
  activeId: string | null
  entries: CronosCharacterGalleryEntry[]
}
