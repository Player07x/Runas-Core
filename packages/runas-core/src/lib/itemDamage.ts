import type { CharacterInventoryItem } from "../types/character"
import { calculateLegacyRarityLevel, modifierToNumber } from "./characterCalculations"

/**
 * Bônus de dano de um item. O jogador escreve apenas a expressão do dano; o
 * bônus é sempre derivado da ficha, nunca digitado:
 *
 * - afinidade: +1 por nível (Ordinário +0, Notável +1, Impressionante +2…);
 * - vínculo: +1 por nível de raridade (Comum +0, Incomum +1, Raro +2…);
 * - tamanho: só com `Usar MT?` ativo, pela diferença `MT do item − MT do personagem`.
 */
export interface ItemDamageBonus {
  affinity: number
  bond: number
  mt: number
  total: number
}

/**
 * Converte a diferença `MT do item − MT do personagem` em bônus de dano.
 * Um item menor que quem o usa penaliza pouco (−1 por ponto); um item maior
 * rende o dobro (+2 por ponto).
 */
export function calculateMtDifferenceDamageBonus(itemMt: number, characterMt: number): number {
  const finite = (value: number) => Math.trunc(Number.isFinite(value) ? value : 0)
  const difference = finite(itemMt) - finite(characterMt)
  return difference < 0 ? difference : difference * 2
}

export function calculateItemDamageBonus(
  item: Pick<CharacterInventoryItem, "affinity" | "bondPoints" | "mt" | "applyScaleWeight">,
  characterSizeModifier: number | string = 0,
): ItemDamageBonus {
  const affinity = Math.max(0, Math.trunc(Number.isFinite(item.affinity) ? item.affinity : 0))
  const bond = calculateLegacyRarityLevel(item.bondPoints)
  const characterMt = typeof characterSizeModifier === "number"
    ? Math.trunc(Number.isFinite(characterSizeModifier) ? characterSizeModifier : 0)
    : modifierToNumber(characterSizeModifier)
  const mt = item.applyScaleWeight ? calculateMtDifferenceDamageBonus(item.mt, characterMt) : 0
  return { affinity, bond, mt, total: affinity + bond + mt }
}

/** Primeiro grupo de dados da expressão e o bônus numérico colado nele (`3D`, `2D+2`, `4D - 1`). */
const DICE_WITH_BONUS = /(\d+\s*[dD])(\s*[+-]\s*\d+)?/
/** Dano já rolado em outro lugar: um número no começo da expressão (`20 queimadura`). */
const LEADING_NUMBER = /^(\s*)([+-]?\s*\d+)/

function signed(value: number): string {
  if (value === 0) return ""
  return value > 0 ? `+${value}` : String(value)
}

/**
 * Soma o bônus do item à própria expressão de dano, preservando tipo e
 * atributo: `2D+2 cortante (+poder)` com bônus 10 vira `2D+12 cortante (+poder)`.
 *
 * Em uma entrada com vários danos consecutivos, o bônus entra no primeiro —
 * ele pertence à arma, não a cada dano adicional que ela provoca.
 * Uma expressão sem valor numérico nenhum volta como veio.
 */
export function composeItemDamageExpression(damage: string, bonus: number): string {
  const amount = Math.trunc(Number.isFinite(bonus) ? bonus : 0)
  if (!damage.trim() || amount === 0) return damage

  const dice = DICE_WITH_BONUS.exec(damage)
  if (dice) {
    const current = dice[2] ? Number(dice[2].replace(/\s+/g, "")) : 0
    return damage.slice(0, dice.index) + dice[1].replace(/\s+/g, "") + signed(current + amount) + damage.slice(dice.index + dice[0].length)
  }

  const flat = LEADING_NUMBER.exec(damage)
  if (flat) {
    const current = Number(flat[2].replace(/\s+/g, ""))
    return `${flat[1]}${current + amount}${damage.slice(flat[0].length)}`
  }

  return damage
}
