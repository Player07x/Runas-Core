import type { AbilityCostMode, AbilityCostType, CharacterSpell, SpellMagicType, SpellRangeType } from "../types/character"

export const SPELL_LIST_KIND = "runas-tools-spell-list"
export const SPELL_LIST_VERSION = 1

export type ImportedSpell = Omit<CharacterSpell, "id">

export interface SpellListFile {
  kind: typeof SPELL_LIST_KIND
  version: typeof SPELL_LIST_VERSION
  spells: ImportedSpell[]
}

const costTypes = new Set<AbilityCostType>(["none", "other", "pv", "pa", "pe", "paExtra", "peTemporary"])
const magicTypes = new Set<SpellMagicType>(["aura", "quick", "spell", "ritual", "enchantment"])
const rangeTypes = new Set<SpellRangeType>(["touch", "personal", "projectile", "targets", "area"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function textField(value: unknown, maximum: number, field: string, position: number): string {
  if (typeof value !== "string" || value.length > maximum) throw new Error(`A magia ${position} possui ${field} inválido.`)
  return value
}

export function withoutSpellId(spell: CharacterSpell): ImportedSpell {
  const { id, ...spellWithoutId } = spell
  void id
  return spellWithoutId
}

/** Monta a lista de magias trocada entre Runas Tools e Runas Book. */
export function buildSpellListFile(spells: CharacterSpell[]): SpellListFile {
  return { kind: SPELL_LIST_KIND, version: SPELL_LIST_VERSION, spells: spells.map(withoutSpellId) }
}

export function parseSpellListFile(text: string): ImportedSpell[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("O arquivo não contém um JSON válido.")
  }
  if (!isRecord(parsed) || parsed.kind !== SPELL_LIST_KIND || parsed.version !== SPELL_LIST_VERSION || !Array.isArray(parsed.spells)) {
    throw new Error("Este não é um arquivo de magias exportado pelo Runas Tools.")
  }
  if (parsed.spells.length === 0) throw new Error("A lista importada não contém magias.")

  return parsed.spells.map((value, index) => parseImportedSpell(value, index + 1))
}

export function parseImportedSpell(value: unknown, position = 1): ImportedSpell {
  if (!isRecord(value)) throw new Error(`A magia ${position} possui um formato inválido.`)
  const name = textField(value.name, 80, "um nome", position).trim()
  if (!name) throw new Error(`A magia ${position} não possui nome.`)
  const costType = value.costType as AbilityCostType
  const costMode = value.costMode as AbilityCostMode
  const magicType = value.magicType as SpellMagicType
  const rangeType = value.rangeType as SpellRangeType
  if (!costTypes.has(costType)) throw new Error(`A magia “${name}” possui um tipo de custo inválido.`)
  if (costMode !== "fixed" && costMode !== "relative") throw new Error(`A magia “${name}” possui uma aplicação de custo inválida.`)
  if (!magicTypes.has(magicType)) throw new Error(`A magia “${name}” possui um tipo inválido.`)
  if (!rangeTypes.has(rangeType)) throw new Error(`A magia “${name}” possui um alcance inválido.`)
  if (!Number.isInteger(value.costValue) || Number(value.costValue) < 0) throw new Error(`A magia “${name}” possui um valor de custo inválido.`)
  const blocksRangeText = rangeType === "touch" || rangeType === "personal"
  return {
    category: textField(value.category, 40, "uma categoria", position).trim(),
    name,
    description: textField(value.description, 5000, "uma descrição", position),
    costType,
    costMode,
    costValue: Number(value.costValue),
    costText: textField(value.costText, 50, "uma descrição de custo", position),
    magicType,
    rangeType,
    rangeText: blocksRangeText ? "" : textField(value.rangeText, 100, "um alcance", position).trim(),
    area: textField(value.area, 100, "uma área", position).trim(),
    duration: textField(value.duration, 100, "uma duração", position).trim(),
    castingSkill: textField(value.castingSkill, 80, "um teste de conjuração", position).trim(),
  }
}
