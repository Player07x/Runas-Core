import { characterElements, type CharacterElement } from "../data/elements"
import type { CharacterAttributes, CharacterElementSkill } from "../types/character"

/**
 * Elementos como perícia curta (seção de Magias). Um elemento tem só nome e
 * nível: o teste é `Místico + Poder + nível`, sem pontos de perícia nem
 * modificadores. Com dois ou mais elementos de nível maior que zero, as
 * fusões possíveis aparecem sozinhas, com o nível somado dos componentes.
 */

/** O que o usuário pode escolher na lista: básicos, raros e divinos. Fusões são derivadas; `Especial` não é adquirido. */
export const selectableElements: CharacterElement[] = characterElements.filter(
  (element) => element.kind === "Básico" || element.kind === "Raro" || element.kind === "Divino",
)

export function normalizeElementName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("pt-BR")
}

/** Nome exibido: o do elemento do livro quando houver `elementId`, senão o digitado. */
export function elementSkillName(element: Pick<CharacterElementSkill, "elementId" | "name">): string {
  return characterElements.find((candidate) => candidate.id === element.elementId)?.name ?? element.name
}

/** Teste do elemento: `Místico + Poder + nível`. */
export function calculateElementTest(attributes: CharacterAttributes, level: number): number {
  return Math.trunc(attributes.mystic + attributes.power + (Number.isFinite(level) ? Math.trunc(level) : 0))
}

/**
 * Receitas de uma fusão. O campo `fusion` é escrito para leitura humana
 * (`Fogo + Terra`, `Luz + Sombra (ou Estelar + Abissal)`), então cada
 * alternativa entre parênteses vira uma receita independente.
 */
export function fusionRecipes(element: CharacterElement): string[][] {
  if (!element.fusion) return []
  const alternatives = element.fusion
    .split(/\(\s*ou\s*/i)
    .map((part) => part.replace(/\)/g, "").trim())
    .filter(Boolean)
  return alternatives
    .map((alternative) => alternative.split("+").map((name) => name.trim()).filter(Boolean))
    .filter((recipe) => recipe.length > 1)
}

export interface AvailableFusion {
  element: CharacterElement
  /** Soma dos níveis dos elementos que formam a fusão. */
  level: number
  /** Nomes usados, na ordem da receita atendida. */
  components: string[]
}

/**
 * Fusões disponíveis para os elementos conhecidos. Só entram elementos de
 * nível maior que zero; quando duas receitas servem (Vazio, por exemplo),
 * vence a de maior nível.
 */
export function availableElementFusions(elements: CharacterElementSkill[]): AvailableFusion[] {
  // Conhecer o elemento basta; o nível dele pode ser +0. O que decide a fusão
  // é ter os componentes na ficha, não o quanto já se evoluiu neles — por isso
  // a presença é guardada à parte do nível, que aqui pode legitimamente ser 0.
  const known = new Map<string, number>()
  for (const element of elements) {
    const level = Math.trunc(Number.isFinite(element.level) ? element.level : 0)
    if (level < 0) continue
    const key = normalizeElementName(elementSkillName(element))
    if (!key) continue
    known.set(key, Math.max(known.get(key) ?? 0, level))
  }
  if (known.size < 2) return []

  const result: AvailableFusion[] = []
  for (const element of characterElements) {
    if (element.kind !== "Fusão") continue
    let best: AvailableFusion | null = null
    for (const recipe of fusionRecipes(element)) {
      const keys = recipe.map((name) => normalizeElementName(name))
      if (!keys.every((key) => known.has(key))) continue
      const level = keys.reduce((total, key) => total + (known.get(key) ?? 0), 0)
      if (!best || level > best.level) best = { element, level, components: recipe }
    }
    if (best) result.push(best)
  }
  return result
}
