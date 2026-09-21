import { resourceColor, resourceFields } from "../resource-fields"
import type { BookResource } from "../book-model"
import type { Block } from "./blocks"

type CardBlock = Extract<Block, { type: "card" }>

/** Monta o cartão de item/habilidade/magia da exportação com exatamente os mesmos campos da leitura (`resource-fields.ts`), inclusive a omissão dos opcionais vazios. */
export function resourceCardBlock(resource: BookResource, resources: BookResource[] = [], categoryColors?: Record<string, string>): CardBlock {
  return {
    type: "card",
    kind: resource.kind,
    title: resource.entity.name || "Sem nome",
    fields: resourceFields(resource, resources),
    description: resource.entity.description || undefined,
    accent: resourceColor(resource, categoryColors),
  }
}
