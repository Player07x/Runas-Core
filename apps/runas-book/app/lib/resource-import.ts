import { ABILITY_LIST_KIND, parseAbilityListFile } from "@runas/core/lib/abilityTransfer"
import { normalizeAbilities, normalizeInventory, normalizeSpells } from "@runas/core/lib/characterStorage"
import { INVENTORY_LIST_KIND, parseInventoryListFile, type ImportedInventoryItem } from "@runas/core/lib/inventoryTransfer"
import { SPELL_LIST_KIND, parseSpellListFile } from "@runas/core/lib/spellTransfer"
import { CHARACTER_VERSION } from "@runas/core/types/character"
import type { CharacterAbility, CharacterInventoryItem, CharacterSpell } from "@runas/core/types/character"
import { makeId, type BookResource, type BookResourceEntity, type BookResourceKind } from "./book-model"

// Usado apenas pelo editor de páginas (carregado sob demanda), junto com a normalização completa do @runas/core.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isResourceKind(value: unknown): value is BookResourceKind {
  return value === "item" || value === "ability" || value === "spell"
}

/** Reaproveita a mesma normalização/validação de `@runas/core` usada para a ficha completa, aplicada a um único registro solto. */
function normalizeResourceEntity(kind: BookResourceKind, raw: unknown): BookResourceEntity | null {
  if (!isRecord(raw)) return null
  if (kind === "item") return normalizeInventory([raw as unknown as CharacterInventoryItem], CHARACTER_VERSION)[0] ?? null
  if (kind === "spell") return normalizeSpells([raw as unknown as CharacterSpell])[0] ?? null
  return normalizeAbilities([raw as unknown as CharacterAbility])[0] ?? null
}

/**
 * Lê um arquivo de recurso exportado pelo próprio Runas Book: um único recurso
 * (`exportResource`) ou os recursos de uma página inteira (`exportPageResources`).
 * Lança erro quando o arquivo não tem esse formato, para o chamador tentar importar como ficha completa.
 */
export function parseResourceImport(jsonText: string): BookResource[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error("Arquivo inválido: não é um JSON.")
  }
  if (!isRecord(parsed)) throw new Error("Arquivo inválido.")

  const rawResources = Array.isArray(parsed.resources)
    ? parsed.resources
    : isResourceKind(parsed.kind) ? [{ kind: parsed.kind, record: parsed.record }] : null
  if (!rawResources) throw new Error("Este arquivo não é um recurso exportado pelo Runas Book.")

  const resources: BookResource[] = rawResources.flatMap((raw) => {
    if (!isRecord(raw) || !isResourceKind(raw.kind)) return []
    const entity = normalizeResourceEntity(raw.kind, raw.record)
    return entity ? [{ id: makeId("resource"), kind: raw.kind, entity }] : []
  })
  if (resources.length === 0) throw new Error("Nenhum recurso válido encontrado no arquivo.")
  return resources
}

/** Converte um item da lista do Runas Tools; o encantamento embutido vira uma magia anexada e vinculada ao item. */
function resourcesFromInventoryItem({ enchantment, bondName, bondAbilityName, skillName, ...item }: ImportedInventoryItem): BookResource[] {
  const spell = enchantment ? { id: makeId("spell"), ...enchantment } : null
  const entity: CharacterInventoryItem = { id: makeId("item"), ...item, enchantmentSpellId: spell?.id ?? "", bondId: bondName, bondAbilityId: bondAbilityName, skillId: skillName }
  return [
    { id: makeId("resource"), kind: "item", entity },
    ...(spell ? [{ id: makeId("resource"), kind: "spell" as const, entity: spell }] : []),
  ]
}

/** Lê as listas de habilidades, magias e inventário exportadas pelo Runas Tools, com os mesmos validadores de `@runas/core`. */
function parseToolsListImport(jsonText: string): BookResource[] {
  let kind: unknown
  try {
    kind = (JSON.parse(jsonText) as { kind?: unknown } | null)?.kind
  } catch {
    throw new Error("Arquivo inválido: não é um JSON.")
  }
  if (kind === ABILITY_LIST_KIND) return parseAbilityListFile(jsonText).map((ability) => ({ id: makeId("resource"), kind: "ability", entity: { id: makeId("ability"), ...ability } }))
  if (kind === SPELL_LIST_KIND) return parseSpellListFile(jsonText).map((spell) => ({ id: makeId("resource"), kind: "spell", entity: { id: makeId("spell"), ...spell } }))
  if (kind === INVENTORY_LIST_KIND) return parseInventoryListFile(jsonText).flatMap(resourcesFromInventoryItem)
  throw new Error("Este arquivo não é uma lista de habilidades, magias ou itens do Runas.")
}

/** Aceita as listas do Runas Tools (habilidades, magias, inventário) e os recursos exportados pelo Runas Book. */
export function parseAnyResourceImport(jsonText: string): BookResource[] {
  try {
    return parseResourceImport(jsonText)
  } catch (bookError) {
    try {
      return parseToolsListImport(jsonText)
    } catch (toolsError) {
      // Lista do Tools com registro inválido: vale o detalhe do validador. Outro formato: mensagem geral.
      if (!/não é uma lista/.test((toolsError as Error).message)) throw toolsError
      if (/JSON/.test((bookError as Error).message)) throw bookError
      throw new Error("Formato não reconhecido. Use uma lista de habilidades, magias ou inventário do Runas Tools, ou um recurso do Runas Book.")
    }
  }
}
