export type AttributeKey =
  | "physical"
  | "mental"
  | "mystic"
  | "strength"
  | "dexterity"
  | "vitality"
  | "intelligence"
  | "knowledge"
  | "social"
  | "faith"
  | "power"
  | "luck"

export type CharacterCalendar = "logi" | "ce"

export interface CharacterInfo {
  currentYear: string
  calendar: CharacterCalendar
  race: string
  species: string
  profession: string
  sizeBase: string
  sizeReal: string
  sizeModifier: string
  sizeModifierBonus: string
  weightBase: string
  weightBonus: string
  weightReal: string
  scaleMultiplier: string
  birthDate: string
  age: string
  region: string
  characterClass: string
  archetype: string
  essences: string
  karma: string
  deity: string
  legacy: string
  legacyPoints: string
  affinity: string
  efficiency: string
  alignment: string
  legacyRarity: string
  loadBase: string
}

export type CharacterAttributes = Record<AttributeKey, number>

export type SecondaryAttributeKey = Exclude<AttributeKey, "physical" | "mental" | "mystic">

export interface CharacterSkill {
  id: string
  name: string
  attributeKey: SecondaryAttributeKey | ""
  points: number
  modifier: number
  locked: boolean
}

export interface CharacterBond {
  id: string
  category: string
  name: string
  points: number
  modifier: number
}

/**
 * Elemento conhecido pelo personagem, na seção de Magias. É um recorte curto
 * da perícia: não tem pontos nem modificadores, só nível. O teste é
 * `Místico + Poder + nível`, e o sistema aceita um elemento onde aceita uma
 * perícia. `elementId` aponta para `characterElements`; vazio significa um
 * elemento digitado à mão, identificado só pelo nome.
 */
export interface CharacterElementSkill {
  id: string
  elementId: string
  name: string
  level: number
}

export type AbilityCostType = "none" | "other" | "pv" | "pa" | "pe" | "paExtra" | "peTemporary"
export type AbilityCostMode = "fixed" | "relative"

export interface CharacterAbility {
  id: string
  category: string
  name: string
  description: string
  permanentModifiers: string
  costType: AbilityCostType
  costMode: AbilityCostMode
  costValue: number
  costText: string
}

export type SpellMagicType = "aura" | "quick" | "spell" | "ritual" | "enchantment"
export type SpellRangeType = "touch" | "personal" | "projectile" | "targets" | "area"

export interface CharacterSpell extends Omit<CharacterAbility, "permanentModifiers"> {
  magicType: SpellMagicType
  rangeType: SpellRangeType
  rangeText: string
  area: string
  duration: string
  castingSkill: string
}

export interface CharacterNote {
  id: string
  category: string
  name: string
  description: string
  date: string
}

export type InventoryUsage = "equipped" | "stored" | "absent"
export type InventoryItemType =
  | "innate"
  | "weapon"
  | "armor"
  | "shield"
  | "artifact"
  | "material"
  | "consumable"
  | "tool"
  | "utility"
  | "accessory"
  | "currency"
  | "other"

export interface CharacterInventoryItem {
  id: string
  usage: InventoryUsage
  name: string
  type: InventoryItemType
  affinity: 0 | 1 | 2 | 3 | 4
  bondPoints: number
  baseWeight: number
  /** Comprimento do item em centímetros; o MT é derivado deste valor. */
  size: number
  /** Modificador de tamanho do item, sempre derivado de `size` pela tabela de tamanho, sem ajuste. */
  mt: number
  quantity: number
  applyScaleWeight: boolean
  damage: string
  rdf: number
  rdm: number
  /** Define o único item equipado cujo RDF/RDM protege o personagem. */
  equippedAsArmor: boolean
  prCurrent: number | null
  prMaximum: number | null
  /** Habilidades da ficha anexadas ao item, de qualquer categoria. Substitui `bondAbilityId` desde a versão 23. */
  abilityIds: string[]
  /** Magias da ficha anexadas ao item, de qualquer tipo — não só encantamentos. Substitui `enchantmentSpellId` desde a versão 23. */
  spellIds: string[]
  bondId: string
  skillId: string
  description: string
}

export interface MasteryImprovements {
  aura: number
  life: number
  energy: number
  determination: number
  casualty: number
}

export interface CharacterStats {
  pv: number
  pvBonus: number
  pa: number
  paBonus: number
  pe: number
  peBonus: number
  peTemporary: number
  paExtra: number
  paExtraBonus: number
  resistances: string[]
  weaknesses: string[]
  elementId: string
  effects: string
  determination: number
  determinationBonus: number
  casualty: number
  casualtyBonus: number
  focusCurrent: number
  focusModifier: number
  currentLoad: number
  loadBonus: number
  willModifier: number
  chanceModifier: number
  perceptionModifier: number
  movementBonus: number
  firstImpressionsBonus: number
  armorRdf: number
  armorRdm: number
  naturalRdf: number
  naturalRdm: number
  mt: number
  masteryImprovements: MasteryImprovements
}

export interface Character {
  version: number
  name: string
  /** Retrato otimizado em data URL para funcionar offline e acompanhar backups. */
  portraitDataUrl?: string
  /**
   * Imagem do token (PNG ou WebP com transparência, quadrada), usada no
   * mapa do RunasVTT. Sem ela, o VTT usa o retrato. Desde a versão 21.
   */
  tokenImageDataUrl?: string
  /** Tamanho do token em células da grade (0,5 a 10, em passos de 0,5). Desde a versão 21. */
  tokenSize?: number
  info: CharacterInfo
  attributes: CharacterAttributes
  stats: CharacterStats
  skills: CharacterSkill[]
  bonds: CharacterBond[]
  abilities: CharacterAbility[]
  /** Elementos conhecidos, exibidos no topo de Magias. Desde a versão 23. */
  elements: CharacterElementSkill[]
  spells: CharacterSpell[]
  inventory: CharacterInventoryItem[]
  notes: CharacterNote[]
}

export interface CharacterGalleryEntry {
  id: string
  character: Character
  updatedAt: number
}

export interface CharacterGallery {
  activeId: string | null
  entries: CharacterGalleryEntry[]
}

/**
 * Formato de arquivo salvo (save manual da ficha).
 * Mantido versionado para permitir migrações futuras.
 */
export interface CharacterSaveFile {
  version: number
  character: Character
}

export const CHARACTER_VERSION = 23
