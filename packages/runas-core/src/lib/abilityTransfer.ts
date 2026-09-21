import type { AbilityCostMode, AbilityCostType, CharacterAbility } from "../types/character"

export const ABILITY_LIST_KIND = "runas-tools-ability-list"
export const ABILITY_LIST_VERSION = 1

export type ImportedAbility = Omit<CharacterAbility, "id">

export interface AbilityListFile {
  kind: typeof ABILITY_LIST_KIND
  version: typeof ABILITY_LIST_VERSION
  abilities: ImportedAbility[]
}

const costTypes = new Set<AbilityCostType>(["none", "other", "pv", "pa", "pe", "paExtra", "peTemporary"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Monta a lista de habilidades trocada entre Runas Tools e Runas Book. */
export function buildAbilityListFile(abilities: CharacterAbility[]): AbilityListFile {
  return {
    kind: ABILITY_LIST_KIND,
    version: ABILITY_LIST_VERSION,
    abilities: abilities.map((ability) => ({
      category: ability.category,
      name: ability.name,
      description: ability.description,
      permanentModifiers: ability.permanentModifiers,
      costType: ability.costType,
      costMode: ability.costMode,
      costValue: ability.costValue,
      costText: ability.costText,
    })),
  }
}

function textField(value: unknown, maximum: number, field: string, position: number): string {
  if (typeof value !== "string" || value.length > maximum) {
    throw new Error(`A habilidade ${position} possui ${field} inválido.`)
  }
  return value
}

export function parseAbilityListFile(text: string): ImportedAbility[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("O arquivo não contém um JSON válido.")
  }

  if (!isRecord(parsed) || parsed.kind !== ABILITY_LIST_KIND || parsed.version !== ABILITY_LIST_VERSION || !Array.isArray(parsed.abilities)) {
    throw new Error("Este não é um arquivo de habilidades exportado pelo Runas Tools.")
  }
  if (parsed.abilities.length === 0) throw new Error("A lista importada não contém habilidades.")

  return parsed.abilities.map((value, index) => parseImportedAbility(value, index + 1))
}

export function parseImportedAbility(value: unknown, position = 1): ImportedAbility {
  if (!isRecord(value)) throw new Error(`A habilidade ${position} possui um formato inválido.`)

  const name = textField(value.name, 80, "um nome", position).trim()
  if (!name) throw new Error(`A habilidade ${position} não possui nome.`)
  const costType = value.costType as AbilityCostType
  if (!costTypes.has(costType)) throw new Error(`A habilidade “${name}” possui um tipo de custo inválido.`)
  if (value.costMode !== "relative" && value.costMode !== "fixed") {
    throw new Error(`A habilidade “${name}” possui uma aplicação de custo inválida.`)
  }
  const costMode: AbilityCostMode = value.costMode
  if (!Number.isInteger(value.costValue) || Number(value.costValue) < 0) {
    throw new Error(`A habilidade “${name}” possui um valor de custo inválido.`)
  }

  return {
    category: textField(value.category, 40, "uma categoria", position).trim(),
    name,
    description: textField(value.description, 5000, "uma descrição", position),
    permanentModifiers: textField(value.permanentModifiers, 500, "modificadores permanentes", position),
    costType,
    costMode,
    costValue: Number(value.costValue),
    costText: textField(value.costText, 50, "uma descrição de custo", position),
  }
}
