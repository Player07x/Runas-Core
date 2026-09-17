import { normalizeAbilities, normalizeInventory, normalizeSpells } from "@runas/core/lib/characterStorage"
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
