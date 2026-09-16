import type { AbilityCostMode, AbilityCostType, Character, CharacterAbility, CharacterBond, CharacterInventoryItem, CharacterNote, CharacterSaveFile, CharacterSkill, CharacterSpell, InventoryItemType, InventoryUsage, SecondaryAttributeKey, SpellMagicType, SpellRangeType } from "../types/character"
import { CHARACTER_VERSION } from "../types/character"
import { CORE_SKILL_IDS, createCoreSkills } from "../data/skills"
import { calculateLoadBase, deriveCharacterInfo, modifierToNumber } from "./characterCalculations"
import { calculateAttributeTest, calculateSkillModifier, normalizeSkillName } from "./skillCalculations"
import { sumAbilityModifiers } from "./abilityModifiers"
import { calculateEquippedArmorDefense, calculateInventoryLoad, normalizeInventoryUsage } from "./inventoryCalculations"
import { createEmptyMasteryImprovements } from "./masteryImprovements"

/** Ficha em branco usada como estado inicial. */
export function createEmptyCharacter(): Character {
  return {
    version: CHARACTER_VERSION,
    name: "",
    info: {
      currentYear: "424",
      calendar: "logi",
      race: "Personalizado",
      species: "",
      profession: "",
      sizeBase: "2.00",
      sizeReal: "2.00",
      sizeModifier: "0",
      sizeModifierBonus: "0",
      weightBase: "100",
      weightBonus: "0",
      weightReal: "100",
      scaleMultiplier: "1.0x",
      birthDate: "",
      age: "",
      region: "",
      characterClass: "",
      archetype: "",
      essences: "0",
      karma: "0",
      deity: "",
      legacy: "",
      legacyPoints: "0",
      affinity: "Ordinário (0)",
      efficiency: "0",
      alignment: "Neutro (0)",
      legacyRarity: "Comum (+0)",
      loadBase: "14",
    },
    attributes: {
      physical: 7,
      mental: 7,
      mystic: 7,
      strength: 0,
      dexterity: 0,
      vitality: 0,
      intelligence: 0,
      knowledge: 0,
      social: 0,
      faith: 0,
      power: 0,
      luck: 0,
    },
    stats: {
      pv: 7,
      pvBonus: 0,
      pa: 7,
      paBonus: 0,
      pe: 4,
      peBonus: 0,
      peTemporary: 4,
      paExtra: 0,
      paExtraBonus: 0,
      resistances: [],
      weaknesses: [],
      elementId: "none",
      effects: "",
      determination: 4,
      determinationBonus: 0,
      casualty: 4,
      casualtyBonus: 0,
      focusCurrent: 35,
      focusModifier: 0,
      currentLoad: 0,
      loadBonus: 0,
      willModifier: 0,
      chanceModifier: 0,
      perceptionModifier: 0,
      movementBonus: 0,
      firstImpressionsBonus: 0,
      armorRdf: 0,
      armorRdm: 0,
      naturalRdf: 0,
      naturalRdm: 0,
      mt: 0,
      masteryImprovements: createEmptyMasteryImprovements(),
    },
    skills: createCoreSkills(),
    bonds: [],
    abilities: [],
    spells: [],
    inventory: [],
    notes: [],
  }
}

const secondaryAttributeKeys = new Set<SecondaryAttributeKey>([
  "strength",
  "dexterity",
  "vitality",
  "intelligence",
  "knowledge",
  "social",
  "faith",
  "power",
  "luck",
])

function integer(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

function nonNegativeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
}

function normalizeSkills(
  partialSkills: CharacterSkill[] | undefined,
): CharacterSkill[] {
  const source = Array.isArray(partialSkills) ? partialSkills : []
  const core = createCoreSkills().map((defaultSkill) => {
    const saved = source.find((skill) =>
      skill?.id === defaultSkill.id || normalizeSkillName(skill?.name ?? "") === normalizeSkillName(defaultSkill.name),
    )
    return saved
      ? {
          ...defaultSkill,
          name: typeof saved.name === "string" && saved.name.trim() ? saved.name.trim().slice(0, 30) : defaultSkill.name,
          attributeKey: secondaryAttributeKeys.has(saved.attributeKey as SecondaryAttributeKey)
            ? saved.attributeKey as SecondaryAttributeKey
            : defaultSkill.attributeKey,
          points: Math.max(0, integer(saved.points)),
          modifier: integer(saved.modifier, defaultSkill.modifier),
        }
      : defaultSkill
  })
  const coreIds = new Set<string>(Object.values(CORE_SKILL_IDS))
  const coreNames = new Set(core.map((skill) => normalizeSkillName(skill.name)))
  const usedIds = new Set<string>(coreIds)
  const custom: CharacterSkill[] = []

  source.forEach((skill, index) => {
    if (!skill || typeof skill !== "object") return
    const name = typeof skill.name === "string" ? skill.name.trim().slice(0, 30) : ""
    if (!name || coreIds.has(skill.id) || coreNames.has(normalizeSkillName(name))) return
    const attributeKey = secondaryAttributeKeys.has(skill.attributeKey as SecondaryAttributeKey)
      ? skill.attributeKey as SecondaryAttributeKey
      : ""
    let id = typeof skill.id === "string" && skill.id.trim() ? skill.id.trim() : `skill-${index + 1}`
    while (usedIds.has(id)) id = `${id}-${index + 1}`
    usedIds.add(id)
    custom.push({
      id,
      name,
      attributeKey,
      points: Math.max(0, integer(skill.points)),
      modifier: integer(skill.modifier),
      locked: false,
    })
  })

  return [...core, ...custom]
}

function normalizeBonds(partialBonds: CharacterBond[] | undefined): CharacterBond[] {
  const source = Array.isArray(partialBonds) ? partialBonds : []
  const usedIds = new Set<string>()
  const usedNames = new Set<string>()
  const bonds: CharacterBond[] = []

  source.forEach((bond, index) => {
    if (!bond || typeof bond !== "object") return
    const name = typeof bond.name === "string" ? bond.name.trim().slice(0, 50) : ""
    const normalizedName = normalizeSkillName(name)
    if (!name || usedNames.has(normalizedName)) return
    usedNames.add(normalizedName)
    let id = typeof bond.id === "string" && bond.id.trim() ? bond.id.trim() : `bond-${index + 1}`
    while (usedIds.has(id)) id = `${id}-${index + 1}`
    usedIds.add(id)
    bonds.push({
      id,
      category: typeof bond.category === "string" ? bond.category.trim().slice(0, 30) : "",
      name,
      points: integer(bond.points),
      modifier: integer(bond.modifier),
    })
  })

  return bonds
}

const abilityCostTypes = new Set<AbilityCostType>(["none", "other", "pv", "pa", "pe", "paExtra", "peTemporary"])

export function normalizeAbilities(partialAbilities: CharacterAbility[] | undefined): CharacterAbility[] {
  const source = Array.isArray(partialAbilities) ? partialAbilities : []
  const usedIds = new Set<string>()

  return source.flatMap((ability, index) => {
    if (!ability || typeof ability !== "object") return []
    const name = typeof ability.name === "string" ? ability.name.trim().slice(0, 80) : ""
    if (!name) return []
    let id = typeof ability.id === "string" && ability.id.trim() ? ability.id.trim() : `ability-${index + 1}`
    while (usedIds.has(id)) id = `${id}-${index + 1}`
    usedIds.add(id)
    const costType = abilityCostTypes.has(ability.costType as AbilityCostType)
      ? ability.costType as AbilityCostType
      : "none"
    const costMode: AbilityCostMode = ability.costMode === "relative" ? "relative" : "fixed"
    return [{
      id,
      category: typeof ability.category === "string" ? ability.category.trim().slice(0, 40) : "",
      name,
      description: typeof ability.description === "string" ? ability.description.slice(0, 5000) : "",
      permanentModifiers: typeof ability.permanentModifiers === "string" ? ability.permanentModifiers.slice(0, 500) : "",
      costType,
      costMode,
      costValue: Math.max(0, integer(ability.costValue)),
      costText: typeof ability.costText === "string" ? ability.costText.slice(0, 50) : "",
    }]
  })
}

const spellMagicTypes = new Set<SpellMagicType>(["aura", "quick", "spell", "ritual", "enchantment"])
const spellRangeTypes = new Set<SpellRangeType>(["touch", "personal", "projectile", "targets", "area"])

export function normalizeSpells(partialSpells: CharacterSpell[] | undefined): CharacterSpell[] {
  const source = Array.isArray(partialSpells) ? partialSpells : []
  const usedIds = new Set<string>()

  return source.flatMap((spell, index) => {
    if (!spell || typeof spell !== "object") return []
    const name = typeof spell.name === "string" ? spell.name.trim().slice(0, 80) : ""
    if (!name) return []
    let id = typeof spell.id === "string" && spell.id.trim() ? spell.id.trim() : `spell-${index + 1}`
    while (usedIds.has(id)) id = `${id}-${index + 1}`
    usedIds.add(id)
    const costType = abilityCostTypes.has(spell.costType as AbilityCostType)
      ? spell.costType as AbilityCostType
      : "none"
    const costMode: AbilityCostMode = spell.costMode === "relative" ? "relative" : "fixed"
    const magicType = spellMagicTypes.has(spell.magicType as SpellMagicType) ? spell.magicType : "spell"
    const rangeType = spellRangeTypes.has(spell.rangeType as SpellRangeType) ? spell.rangeType : "personal"
    const blocksRangeText = rangeType === "touch" || rangeType === "personal"
    return [{
      id,
      category: typeof spell.category === "string" ? spell.category.trim().slice(0, 40) : "",
      name,
      description: typeof spell.description === "string" ? spell.description.slice(0, 5000) : "",
      costType,
      costMode,
      costValue: Math.max(0, integer(spell.costValue)),
      costText: typeof spell.costText === "string" ? spell.costText.slice(0, 50) : "",
      magicType,
      rangeType,
      rangeText: blocksRangeText ? "" : typeof spell.rangeText === "string" ? spell.rangeText.trim().slice(0, 100) : "",
      area: typeof spell.area === "string" ? spell.area.trim().slice(0, 100) : "",
      duration: typeof spell.duration === "string" ? spell.duration.trim().slice(0, 100) : "",
      castingSkill: typeof spell.castingSkill === "string" ? spell.castingSkill.trim().slice(0, 80) : "",
    }]
  })
}

function normalizeNotes(partialNotes: CharacterNote[] | undefined): CharacterNote[] {
  const source = Array.isArray(partialNotes) ? partialNotes : []
  const usedIds = new Set<string>()

  return source.flatMap((note, index) => {
    if (!note || typeof note !== "object") return []
    const name = typeof note.name === "string" ? note.name.trim().slice(0, 80) : ""
    if (!name) return []
    let id = typeof note.id === "string" && note.id.trim() ? note.id.trim() : `note-${index + 1}`
    while (usedIds.has(id)) id = `${id}-${index + 1}`
    usedIds.add(id)
    return [{
      id,
      category: typeof note.category === "string" ? note.category.trim().slice(0, 40) : "",
      name,
      description: typeof note.description === "string" ? note.description.slice(0, 5000) : "",
      date: typeof note.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(note.date) ? note.date : "",
    }]
  })
}

const inventoryUsages = new Set<InventoryUsage>(["equipped", "stored", "absent"])
const inventoryItemTypes = new Set<InventoryItemType>([
  "innate", "weapon", "armor", "shield", "artifact", "material", "consumable", "tool", "utility", "accessory", "currency", "other",
])

export function normalizeInventory(partialItems: CharacterInventoryItem[] | undefined, sourceVersion: number): CharacterInventoryItem[] {
  const source = Array.isArray(partialItems) ? partialItems : []
  const usedIds = new Set<string>()
  let equippedArmorFound = false

  return source.flatMap((item, index) => {
    if (!item || typeof item !== "object") return []
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 80) : ""
    if (!name) return []
    let id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `item-${index + 1}`
    while (usedIds.has(id)) id = `${id}-${index + 1}`
    usedIds.add(id)
    const type = inventoryItemTypes.has(item.type as InventoryItemType) ? item.type as InventoryItemType : "other"
    const usage = normalizeInventoryUsage(type, inventoryUsages.has(item.usage as InventoryUsage) ? item.usage as InventoryUsage : "stored")
    const requestedAsArmor = sourceVersion < 20
      ? type === "armor" && usage === "equipped"
      : Boolean(item.equippedAsArmor) && usage === "equipped"
    const equippedAsArmor = requestedAsArmor && !equippedArmorFound
    if (equippedAsArmor) equippedArmorFound = true
    const affinity = Math.max(0, Math.min(4, integer(item.affinity))) as CharacterInventoryItem["affinity"]
    return [{
      id,
      usage,
      name,
      type,
      affinity,
      bondPoints: Math.max(0, integer(item.bondPoints)),
      baseWeight: nonNegativeNumber(item.baseWeight),
      quantity: Math.max(1, integer(item.quantity, 1)),
      applyScaleWeight: Boolean(item.applyScaleWeight),
      damage: typeof item.damage === "string" ? item.damage.trim().slice(0, 160) : "",
      rdf: Math.max(0, integer(item.rdf)),
      rdm: Math.max(0, integer(item.rdm)),
      equippedAsArmor,
      prMaximum: item.prMaximum === null || item.prMaximum === undefined ? null : Math.max(0, integer(item.prMaximum)),
      prCurrent: item.prCurrent === null || item.prCurrent === undefined
        ? null
        : Math.min(item.prMaximum === null || item.prMaximum === undefined ? Number.POSITIVE_INFINITY : Math.max(0, integer(item.prMaximum)), Math.max(0, integer(item.prCurrent))),
      enchantmentSpellId: typeof item.enchantmentSpellId === "string" ? item.enchantmentSpellId.slice(0, 100) : "",
      bondId: typeof item.bondId === "string" ? item.bondId.slice(0, 100) : "",
      bondAbilityId: typeof item.bondAbilityId === "string" ? item.bondAbilityId.slice(0, 100) : "",
      skillId: typeof item.skillId === "string" ? item.skillId.slice(0, 100) : "",
      description: typeof item.description === "string" ? item.description.slice(0, 5000) : "",
    }]
  })
}

/**
 * Faz merge da ficha carregada com a estrutura padrão.
 * Garante que campos novos (adicionados em versões futuras) sempre existam.
 */
export function normalizeCharacter(partial: Partial<Character> | undefined): Character {
  const base = createEmptyCharacter()
  if (!partial) return base
  const attributes = { ...base.attributes, ...(partial.attributes ?? {}) }
  if ((partial.version ?? 1) < 2) {
    for (const key of [
      "strength",
      "dexterity",
      "vitality",
      "intelligence",
      "knowledge",
      "social",
      "faith",
      "power",
      "luck",
    ] as const) {
      attributes[key] = 0
    }
  }
  const groups = [
    ["physical", ["strength", "dexterity", "vitality"]],
    ["mental", ["intelligence", "knowledge", "social"]],
    ["mystic", ["faith", "power", "luck"]],
  ] as const
  for (const [primaryKey, secondaryKeys] of groups) {
    const primary = Math.max(1, Math.floor(Number(attributes[primaryKey]) || 0))
    attributes[primaryKey] = primary
    for (const key of secondaryKeys) {
      attributes[key] = Math.min(primary, Math.max(0, Math.floor(Number(attributes[key]) || 0)))
    }
  }
  const legacyInfo = (partial.info ?? {}) as Partial<Character["info"]> & {
    size?: string
    weight?: string
  }
  const mergedInfo = { ...base.info, ...legacyInfo }
  if ((partial.version ?? 1) < 4) {
    mergedInfo.sizeReal = legacyInfo.size || base.info.sizeReal
    mergedInfo.weightReal = legacyInfo.weight || base.info.weightReal
  }
  if ((partial.version ?? 1) < 5) {
    const previousWeightReal = Number(mergedInfo.weightReal.replace(",", "."))
    const scaleMultiplier = Number(
      deriveCharacterInfo({ ...mergedInfo, weightBonus: "0" }).scaleMultiplier.replace(/x/gi, ""),
    )
    const baseWeight = Number(mergedInfo.weightBase.replace(",", "."))
    if (Number.isFinite(previousWeightReal) && Number.isFinite(scaleMultiplier) && Number.isFinite(baseWeight)) {
      mergedInfo.weightBonus = String(Number((previousWeightReal - baseWeight * scaleMultiplier ** 3).toFixed(3)))
    }
  }
  if (mergedInfo.calendar !== "logi" && mergedInfo.calendar !== "ce") mergedInfo.calendar = "logi"
  const info = deriveCharacterInfo(mergedInfo)
  info.loadBase = calculateLoadBase(attributes.physical, attributes.strength, info.scaleMultiplier)
  const partialStats = (partial.stats ?? {}) as Partial<Character["stats"]> & {
    willBonus?: number
    chanceBonus?: number
    perceptionBonus?: number
  }
  const stats = { ...base.stats, ...partialStats }
  stats.willModifier = integer(partialStats.willModifier ?? partialStats.willBonus)
  stats.chanceModifier = integer(partialStats.chanceModifier ?? partialStats.chanceBonus)
  stats.perceptionModifier = integer(partialStats.perceptionModifier ?? partialStats.perceptionBonus)
  stats.firstImpressionsBonus = integer(partialStats.firstImpressionsBonus)
  delete (stats as typeof stats & { willBonus?: number }).willBonus
  delete (stats as typeof stats & { chanceBonus?: number }).chanceBonus
  delete (stats as typeof stats & { perceptionBonus?: number }).perceptionBonus
  stats.resistances = Array.isArray(partialStats.resistances)
    ? partialStats.resistances.filter((value): value is string => typeof value === "string")
    : base.stats.resistances
  stats.weaknesses = Array.isArray(partialStats.weaknesses)
    ? partialStats.weaknesses.filter((value): value is string => typeof value === "string")
    : base.stats.weaknesses
  stats.elementId = typeof partialStats.elementId === "string" ? partialStats.elementId : base.stats.elementId
  stats.effects = typeof partialStats.effects === "string" ? partialStats.effects : base.stats.effects
  stats.pv = integer(partialStats.pv, base.stats.pv)
  stats.pa = Math.max(0, integer(partialStats.pa, base.stats.pa))
  stats.pe = Math.max(0, integer(partialStats.pe, base.stats.pe))
  stats.paExtra = Math.max(0, integer(partialStats.paExtra, base.stats.paExtra))
  stats.peTemporary = Math.max(0, integer(partialStats.peTemporary, base.stats.peTemporary))
  stats.determination = Math.max(0, integer(partialStats.determination, base.stats.determination))
  stats.casualty = Math.max(0, integer(partialStats.casualty, base.stats.casualty))
  const partialMastery = partialStats.masteryImprovements
  stats.masteryImprovements = {
    aura: Math.max(0, integer(partialMastery?.aura)),
    life: Math.max(0, integer(partialMastery?.life)),
    energy: Math.max(0, integer(partialMastery?.energy)),
    determination: Math.max(0, integer(partialMastery?.determination)),
    casualty: Math.max(0, integer(partialMastery?.casualty)),
  }
  stats.currentLoad = Math.max(0, nonNegativeNumber(partialStats.currentLoad, base.stats.currentLoad))
  stats.mt = modifierToNumber(info.sizeModifier)
  const skills = normalizeSkills(partial.skills)
  const bonds = normalizeBonds(partial.bonds)
  const abilities = normalizeAbilities(partial.abilities)
  const spells = normalizeSpells(partial.spells)
  const inventory = normalizeInventory(partial.inventory, partial.version ?? 1)
  const notes = normalizeNotes(partial.notes)
  const equippedDefense = calculateEquippedArmorDefense(inventory)
  stats.currentLoad = calculateInventoryLoad(inventory, info.scaleMultiplier)
  stats.armorRdf = equippedDefense.rdf
  stats.armorRdm = equippedDefense.rdm
  const abilityModifiers = sumAbilityModifiers(abilities)
  const willSkill = skills.find((skill) => skill.id === CORE_SKILL_IDS.will) ?? createCoreSkills()[0]
  const focusMaximum = Math.max(
    0,
    5 * (
      (willSkill.attributeKey ? calculateAttributeTest(attributes, willSkill.attributeKey) : 0) +
      calculateSkillModifier(willSkill) +
      integer(stats.willModifier)
    ) + integer(stats.focusModifier) + abilityModifiers.focus,
  )
  stats.focusCurrent = partialStats.focusCurrent === undefined
    ? focusMaximum
    : Math.min(focusMaximum, Math.max(0, integer(partialStats.focusCurrent)))
  return {
    ...base,
    ...partial,
    version: CHARACTER_VERSION,
    portraitDataUrl: typeof partial.portraitDataUrl === "string" && partial.portraitDataUrl.startsWith("data:image/") ? partial.portraitDataUrl : undefined,
    info,
    attributes,
    stats,
    skills,
    bonds,
    abilities,
    spells,
    inventory,
    notes,
  }
}

/** Valida e normaliza uma ficha importada de arquivo .json. */
export function parseCharacterFile(jsonText: string): Character {
  const data = JSON.parse(jsonText) as Partial<CharacterSaveFile> & Partial<Character>
  // Aceita tanto o formato { version, character } quanto uma ficha "crua".
  const candidate = (data as CharacterSaveFile).character ?? (data as Character)
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Arquivo inválido: estrutura da ficha não encontrada.")
  }
  return normalizeCharacter(candidate)
}
