import { calculateItemRealWeight, inventoryTypeLabel, inventoryUsageLabel, itemAffinityOptions } from "@runas/core/lib/inventoryCalculations"
import { calculateItemDamageBonus, composeItemDamageExpression } from "@runas/core/lib/itemDamage"
import type { CharacterAbility, CharacterInventoryItem, CharacterSpell } from "@runas/core/types/character"
import type { BookResource, BookResourceKind } from "./book-model"

/**
 * Campos exibidos de um recurso importado, na mesma ordem para a leitura e
 * para a exportação. Campo opcional vazio não entra: um item sem dano não
 * mostra "Dano —", e uma magia de custo relativo não mostra um valor fixo que
 * não significa nada. Só o que o recurso realmente tem aparece.
 */

export interface ResourceField {
  label: string
  value: string
}

const costLabels: Record<CharacterAbility["costType"], string> = {
  none: "Nenhum", other: "Outro", pv: "PV Atual", pa: "PA Atual", pe: "PE Atual", paExtra: "PA Extra", peTemporary: "PE Temporário",
}

const magicTypeLabels: Record<CharacterSpell["magicType"], string> = {
  aura: "Aura", quick: "Rápida", spell: "Feitiço", ritual: "Ritual", enchantment: "Encantamento",
}

const rangeTypeLabels: Record<CharacterSpell["rangeType"], string> = {
  touch: "Toque", personal: "Pessoal", projectile: "Projétil", targets: "Alvo(s)", area: "Área",
}

export function magicTypeLabel(value: CharacterSpell["magicType"]): string {
  return magicTypeLabels[value] ?? value
}

export function rangeTypeLabel(value: CharacterSpell["rangeType"]): string {
  return rangeTypeLabels[value] ?? value
}

/**
 * Resumo do custo. `Relativo` não tem valor fixo para mostrar, e `Outro`
 * mostra o próprio texto do custo no lugar dele.
 */
export function costSummary(source: Pick<CharacterAbility, "costType" | "costMode" | "costValue" | "costText">): string {
  if (source.costType === "none") return ""
  if (source.costType === "other") return source.costText || "Outro"
  const label = costLabels[source.costType] ?? source.costType
  return source.costMode === "relative" ? `${label} · Relativo` : `${source.costValue} ${label}`
}

export function linkedName(id: string, kind: BookResourceKind, resources: BookResource[]): string {
  if (!id) return ""
  return resources.find((candidate) => candidate.kind === kind && (candidate.id === id || candidate.entity.id === id))?.entity.name ?? id
}

function linkedNames(ids: string[], kind: BookResourceKind, resources: BookResource[]): string {
  return ids.map((id) => linkedName(id, kind, resources)).filter(Boolean).join(", ")
}

export function resourceFields(resource: BookResource, resources: BookResource[] = []): ResourceField[] {
  const fields: ResourceField[] = []
  const push = (label: string, value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value).trim()
    if (text) fields.push({ label, value: text })
  }

  if (resource.kind === "item") {
    const item = resource.entity as CharacterInventoryItem
    const bonus = calculateItemDamageBonus(item)
    push("Uso", inventoryUsageLabel(item.usage))
    push("Tipo", inventoryTypeLabel(item.type))
    if (item.affinity > 0) push("Afinidade", itemAffinityOptions[item.affinity]?.label)
    if (item.bondPoints > 0) push("Pontos de vínculo", item.bondPoints)
    if (item.size > 0) { push("Tamanho", `${item.size} cm`); push("MT", item.mt > 0 ? `+${item.mt}` : String(item.mt)) }
    if (item.baseWeight > 0) { push("Peso base", `${item.baseWeight} kg`); push("Peso real", `${calculateItemRealWeight(item, "1x")} kg`) }
    if (item.quantity > 1) push("Quantidade", item.quantity)
    if (item.damage.trim()) {
      push("Dano", item.damage)
      if (bonus.total !== 0) push("Bônus", `${bonus.total > 0 ? "+" : ""}${bonus.total} → ${composeItemDamageExpression(item.damage, bonus.total)}`)
    }
    if (item.rdf > 0) push("RDF", item.rdf)
    if (item.rdm > 0) push("RDM", item.rdm)
    if (item.prCurrent !== null || item.prMaximum !== null) push("PR", `${item.prCurrent ?? "—"} / ${item.prMaximum ?? "—"}`)
    push("Magias", linkedNames(item.spellIds, "spell", resources))
    push("Habilidades", linkedNames(item.abilityIds, "ability", resources))
    push("Vínculo", item.bondId)
    push("Perícia", item.skillId)
    return fields
  }

  if (resource.kind === "spell") {
    const spell = resource.entity as CharacterSpell
    push("Categoria", spell.category)
    push("Tipo de magia", magicTypeLabel(spell.magicType))
    push("Tipo de alcance", rangeTypeLabel(spell.rangeType))
    push("Alcance", spell.rangeText)
    push("Área", spell.area)
    push("Duração", spell.duration)
    push("Teste de conjuração", spell.castingSkill)
    push("Custo", costSummary(spell))
    // O valor fixo só existe num custo de recurso aplicado de forma fixa:
    // "Relativo" não tem número, e "Outro" já é o próprio texto do custo.
    if (spell.costType !== "none" && spell.costType !== "other" && spell.costMode === "fixed") push("Valor fixo", spell.costValue)
    return fields
  }

  const ability = resource.entity as CharacterAbility
  push("Categoria", ability.category)
  push("Modificadores permanentes", ability.permanentModifiers)
  push("Custo", costSummary(ability))
  if (ability.costType !== "none" && ability.costType !== "other" && ability.costMode === "fixed") push("Valor fixo", ability.costValue)
  return fields
}

/**
 * Categoria usada para colorir a box. Habilidades e magias trazem a própria
 * categoria; um item usa o tipo, que é a categoria que ele de fato tem.
 */
export function resourceCategory(resource: BookResource): string {
  if (resource.kind === "item") return inventoryTypeLabel((resource.entity as CharacterInventoryItem).type)
  return ((resource.entity as CharacterAbility).category ?? "").trim()
}

export function resourceCategoryKey(category: string): string {
  return category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR")
}

/** Cor configurada pelo DM para a categoria do recurso, ou `undefined`. */
export function resourceColor(resource: BookResource, categoryColors: Record<string, string> | undefined): string | undefined {
  const key = resourceCategoryKey(resourceCategory(resource))
  return key ? categoryColors?.[key] : undefined
}

/** Todas as categorias presentes nos recursos, sem repetição e em ordem alfabética. */
export function collectResourceCategories(resources: BookResource[]): string[] {
  const byKey = new Map<string, string>()
  for (const resource of resources) {
    const category = resourceCategory(resource)
    const key = resourceCategoryKey(category)
    if (key && !byKey.has(key)) byKey.set(key, category)
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "pt-BR"))
}
