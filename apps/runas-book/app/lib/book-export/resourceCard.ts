import { calculateItemRealWeight, inventoryTypeLabel, inventoryUsageLabel, itemAffinityOptions } from "@runas/core/lib/inventoryCalculations"
import type { CharacterAbility, CharacterInventoryItem, CharacterSpell } from "@runas/core/types/character"
import { costSummary, linkedName, magicTypeLabel, rangeTypeLabel } from "../../components/resource-panel"
import type { BookResource } from "../book-model"
import type { Block } from "./blocks"

type CardBlock = Extract<Block, { type: "card" }>

/** Monta o cartão de item/habilidade/magia exibido na exportação do livro, com os mesmos rótulos usados no cartão de leitura (`resource-panel.tsx`). */
export function resourceCardBlock(resource: BookResource, resources: BookResource[] = []): CardBlock {
  const fields: { label: string; value: string }[] = []
  if (resource.kind === "item") {
    const item = resource.entity as CharacterInventoryItem
    fields.push({ label: "Uso", value: inventoryUsageLabel(item.usage) })
    fields.push({ label: "Tipo", value: inventoryTypeLabel(item.type) })
    fields.push({ label: "Afinidade", value: itemAffinityOptions[item.affinity]?.label ?? String(item.affinity) })
    fields.push({ label: "Pontos de vínculo", value: String(item.bondPoints) })
    fields.push({ label: "Tamanho", value: item.size > 0 ? `${item.size} cm` : "—" })
    fields.push({ label: "MT", value: String(item.mt) })
    fields.push({ label: "Peso base", value: `${item.baseWeight} kg` })
    fields.push({ label: "Peso real", value: `${calculateItemRealWeight(item, "1x")} kg` })
    fields.push({ label: "Quantidade", value: String(item.quantity) })
    fields.push({ label: "Dano", value: item.damage || "—" })
    fields.push({ label: "RDF", value: String(item.rdf) })
    fields.push({ label: "RDM", value: String(item.rdm) })
    fields.push({ label: "PR", value: item.prCurrent !== null || item.prMaximum !== null ? `${item.prCurrent ?? "—"} / ${item.prMaximum ?? "—"}` : "—" })
    fields.push({ label: "Encantamento", value: linkedName(item.enchantmentSpellId, "spell", resources) || "Nenhum" })
    fields.push({ label: "Vínculo", value: item.bondId || "Nenhum" })
    fields.push({ label: "Habilidade de vínculo", value: linkedName(item.bondAbilityId, "ability", resources) || "Nenhuma" })
    fields.push({ label: "Perícia", value: item.skillId || "Nenhuma" })
  } else if (resource.kind === "spell") {
    const spell = resource.entity as CharacterSpell
    fields.push({ label: "Categoria", value: spell.category || "—" })
    fields.push({ label: "Tipo de magia", value: magicTypeLabel(spell.magicType) })
    fields.push({ label: "Tipo de alcance", value: rangeTypeLabel(spell.rangeType) })
    fields.push({ label: "Alcance", value: spell.rangeText || "—" })
    fields.push({ label: "Área", value: spell.area || "—" })
    fields.push({ label: "Duração", value: spell.duration || "—" })
    fields.push({ label: "Teste de conjuração", value: spell.castingSkill || "—" })
    fields.push({ label: "Custo", value: costSummary(spell) })
    fields.push({ label: "Aplicação", value: spell.costMode === "relative" ? "Relativo" : "Fixo" })
    fields.push({ label: "Valor fixo", value: String(spell.costValue) })
  } else {
    const ability = resource.entity as CharacterAbility
    fields.push({ label: "Categoria", value: ability.category })
    fields.push({ label: "Modificadores permanentes", value: ability.permanentModifiers || "—" })
    fields.push({ label: "Custo", value: costSummary(ability) })
  }
  return {
    type: "card",
    kind: resource.kind,
    title: resource.entity.name || "Sem nome",
    fields,
    description: resource.entity.description || undefined,
  }
}
