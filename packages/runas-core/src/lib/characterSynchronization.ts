import { attributeGroups } from "../data/attributes"
import { getCharacterElement } from "../data/elements"
import type { Character } from "../types/character"
import { calculateItemSizeModifier, calculateLoadBase, convertCalendarYear, deriveCharacterInfo, modifierToNumber } from "./characterCalculations"
import { calculateCharacterStatSnapshot } from "./characterStatCalculations"
import { calculateEquippedArmorDefense, calculateInventoryLoad, normalizeInventoryUsage } from "./inventoryCalculations"

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/**
 * Aplica as mesmas invariantes usadas pela ficha do Runas Tools depois de
 * qualquer edição. Recebe o estado anterior para reconhecer mudanças como a
 * troca de calendário e devolve um novo personagem, sem mutar os argumentos.
 *
 * Runas Tools e Runas DM devem passar toda edição de ficha por esta função.
 */
export function synchronizeCharacterDerivedValues(previous: Character, changed: Character): Character {
  const attributes = { ...changed.attributes }
  let equippedArmorFound = false
  // Habilidades e magias anexadas a um item são referências: ao remover o
  // registro da ficha, o item não pode continuar apontando para o vazio.
  const abilityIds = new Set(changed.abilities.map((ability) => ability.id))
  const spellIds = new Set(changed.spells.map((spell) => spell.id))
  const inventory = changed.inventory.map((item) => {
    const usage = normalizeInventoryUsage(item.type, item.usage)
    const equippedAsArmor = usage === "equipped" && item.equippedAsArmor && !equippedArmorFound
    if (equippedAsArmor) equippedArmorFound = true
    return {
      ...item,
      usage,
      equippedAsArmor,
      size: Math.max(0, finite(item.size)),
      mt: calculateItemSizeModifier(item.size),
      abilityIds: (item.abilityIds ?? []).filter((id) => abilityIds.has(id)),
      spellIds: (item.spellIds ?? []).filter((id) => spellIds.has(id)),
    }
  })
  const elements = (changed.elements ?? []).map((element) => ({ ...element, level: Math.max(0, Math.trunc(finite(element.level))) }))

  for (const group of attributeGroups) {
    const primaryKey = group.primary.key
    attributes[primaryKey] = Math.max(1, Math.floor(finite(attributes[primaryKey])))

    for (const attribute of group.attributes) {
      const value = Math.max(0, Math.floor(finite(attributes[attribute.key])))
      attributes[attribute.key] = Math.min(attributes[primaryKey], value)
    }
  }

  let info = { ...changed.info }
  if (previous.info.calendar !== info.calendar && previous.info.currentYear === info.currentYear) {
    info.currentYear = convertCalendarYear(info.currentYear, previous.info.calendar, info.calendar)
  }
  info = deriveCharacterInfo(info)
  info.loadBase = calculateLoadBase(attributes.physical, attributes.strength, info.scaleMultiplier)

  const stats = { ...changed.stats, masteryImprovements: { ...changed.stats.masteryImprovements } }
  const element = getCharacterElement(stats.elementId)
  if (element) {
    stats.resistances = [...new Set([...element.resistances, ...stats.resistances])]
    stats.weaknesses = [...new Set([...element.weaknesses, ...stats.weaknesses])]
  }
  stats.mt = modifierToNumber(info.sizeModifier)
  stats.currentLoad = calculateInventoryLoad(inventory, info.scaleMultiplier)
  const defense = calculateEquippedArmorDefense(inventory)
  stats.armorRdf = defense.rdf
  stats.armorRdm = defense.rdm

  const snapshot = calculateCharacterStatSnapshot(attributes, info, stats, changed.skills, changed.abilities)
  stats.pv = Math.min(snapshot.pvMax, finite(stats.pv))
  stats.pa = Math.min(snapshot.paMax, Math.max(0, finite(stats.pa)))
  stats.pe = Math.min(snapshot.peMax, Math.max(0, finite(stats.pe)))
  stats.paExtra = Math.min(snapshot.paExtraMax, Math.max(0, finite(stats.paExtra)))
  stats.peTemporary = Math.min(snapshot.peTemporaryMax, Math.max(0, finite(stats.peTemporary)))
  stats.focusCurrent = Math.min(snapshot.focusMaximum, Math.max(0, finite(stats.focusCurrent)))
  stats.determination = Math.min(snapshot.determinationMax, Math.max(0, finite(stats.determination)))
  stats.casualty = Math.min(snapshot.casualtyMax, Math.max(0, finite(stats.casualty)))

  return { ...changed, attributes, info, stats, inventory, elements }
}
