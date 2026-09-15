import { inventoryTypeLabel, inventoryUsageLabel } from "@runas/core/lib/inventoryCalculations"
import type { CharacterAbility, CharacterInventoryItem, CharacterSpell } from "@runas/core/types/character"
import { costSummary, magicTypeLabel, rangeTypeLabel } from "../../components/resource-panel"
import type { BookResource } from "../book-model"
import type { Block } from "./blocks"

type CardBlock = Extract<Block, { type: "card" }>

/** Monta o cartão de item/habilidade/magia exibido na exportação do livro, com os mesmos rótulos usados no cartão de leitura (`resource-panel.tsx`). */
export function resourceCardBlock(resource: BookResource): CardBlock {
  const fields: { label: string; value: string }[] = []
  if (resource.kind === "item") {
    const item = resource.entity as CharacterInventoryItem
    fields.push({ label: "Uso", value: inventoryUsageLabel(item.usage) })
    fields.push({ label: "Tipo", value: inventoryTypeLabel(item.type) })
    fields.push({ label: "Quantidade", value: String(item.quantity) })
    if (item.damage) fields.push({ label: "Dano", value: item.damage })
    if (item.rdf > 0 || item.rdm > 0) {
      fields.push({ label: "RDF", value: String(item.rdf) })
      fields.push({ label: "RDM", value: String(item.rdm) })
    }
  } else if (resource.kind === "spell") {
    const spell = resource.entity as CharacterSpell
    fields.push({ label: "Tipo", value: magicTypeLabel(spell.magicType) })
    fields.push({ label: "Alcance", value: rangeTypeLabel(spell.rangeType) })
    if (spell.duration) fields.push({ label: "Duração", value: spell.duration })
    fields.push({ label: "Custo", value: costSummary(spell) })
  } else {
    const ability = resource.entity as CharacterAbility
    fields.push({ label: "Categoria", value: ability.category })
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
