import type { CharacterCalendar, CharacterInfo } from "../types/character"

const CALENDAR_OFFSET = 4027

const SIZE_MODIFIER_LIMITS = [
  [0.02, -11],
  [0.03, -10],
  [0.05, -9],
  [0.07, -8],
  [0.09, -7],
  [0.19, -6],
  [0.29, -5],
  [0.39, -4],
  [0.49, -3],
  [0.99, -2],
  [1.49, -1],
  [2, 0],
  [3, 1],
  [5, 2],
  [8, 3],
  [12, 4],
  [18, 5],
  [27, 6],
  [40, 7],
  [60, 8],
  [90, 9],
  [150, 10],
  [200, 11],
  [300, 12],
  [500, 13],
  [800, 14],
  [1200, 15],
  [1800, 16],
  [2700, 17],
  [4000, 18],
  [6000, 19],
  [9000, 20],
] as const

const ESSENCE_THRESHOLDS = [
  [0, 10, 30, 60, 100, 150, 210, 280, 360, 450],
  [560, 690, 840, 1010, 1200, 1410, 1640, 1890, 2160, 2450],
  [2770, 3120, 3500, 3910, 4350, 4820, 5320, 5850, 6410, 7000],
  [7630, 8300, 9010, 9760, 10550, 11380, 12250, 13160, 14110, 15100],
  [16140, 17230, 18370, 19560, 20800, 22090, 23430, 24820, 26260, 27750],
] as const

const AFFINITY_NAMES = ["Ordinário", "Notável", "Impressionante", "Excepcional", "Extraordinário"] as const

function parseNumber(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."))
  return Number.isFinite(parsed) ? parsed : null
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

/** Arredonda sempre para cima e mantém uma casa decimal. */
export function calculateScaleMultiplier(realSizeValue: string, baseSizeValue: string): string {
  const realSize = parseNumber(realSizeValue)
  const baseSize = parseNumber(baseSizeValue)
  if (realSize === null || baseSize === null || realSize < 0 || baseSize <= 0) return ""

  const ratio = realSize / baseSize
  const floatingPointTolerance = Number.EPSILON * 10 * Math.max(1, Math.abs(ratio))
  const roundedUp = Math.ceil(ratio * 10 - floatingPointTolerance) / 10
  return `${roundedUp.toFixed(1)}x`
}

export function calculateRealWeight(
  baseWeightValue: string,
  scaleMultiplierValue: string,
  bonusValue: string,
): string {
  const baseWeight = parseNumber(baseWeightValue)
  const scaleMultiplier = parseNumber(scaleMultiplierValue.replace(/x/gi, ""))
  if (baseWeight === null || scaleMultiplier === null) return ""

  const bonus = parseNumber(bonusValue) ?? 0
  return String(Number((baseWeight * scaleMultiplier ** 3 + bonus).toFixed(3)))
}

export function calculateLoadBase(
  physical: number,
  strengthBonus: number,
  scaleMultiplierValue: string,
): string {
  const scaleMultiplier = parseNumber(scaleMultiplierValue.replace(/x/gi, ""))
  if (scaleMultiplier === null) return ""

  const result = 2 * (Math.max(0, physical) + Math.max(0, strengthBonus)) * scaleMultiplier ** 3
  return String(Math.trunc(result))
}

/**
 * Aplica o Modificador de Tamanho do Livro Azul ao deslocamento.
 * MT +1 equivale a 1,5x; valores positivos seguintes multiplicam pelo
 * próprio MT; valores negativos reduzem o deslocamento sem deixá-lo abaixo de 1.
 */
export function applySizeModifierToMovement(movementValue: number, sizeModifierValue: string | number): number {
  const movement = Math.max(0, Number.isFinite(movementValue) ? movementValue : 0)
  const parsed = typeof sizeModifierValue === "number" ? sizeModifierValue : parseNumber(sizeModifierValue)
  const mt = Math.trunc(parsed ?? 0)
  if (mt > 0) return movement * (mt === 1 ? 1.5 : mt)
  if (mt < 0) return Math.max(1, movement + mt)
  return movement
}

export function calculateSizeModifier(sizeValue: string, bonusValue: string): string {
  const size = parseNumber(sizeValue)
  if (size === null || size <= 0) return ""

  let baseModifier = 20
  for (const [upperLimit, modifier] of SIZE_MODIFIER_LIMITS) {
    if (size <= upperLimit) {
      baseModifier = modifier
      break
    }
  }
  if (size >= 9000) {
    baseModifier = 20 + Math.floor((size - 6000) / 3000)
  }

  const bonus = Math.trunc(parseNumber(bonusValue) ?? 0)
  return formatSigned(baseModifier + bonus)
}

/**
 * Calcula o MT de um item a partir do seu comprimento em centímetros.
 * Itens usam a mesma tabela de tamanho das fichas, mas recebem +2 de ajuste
 * conforme a regra do livro (por exemplo, 80 cm: -2 + 2 = MT +0).
 */
export function calculateItemSizeModifier(sizeValue: number | string): number {
  const raw = typeof sizeValue === "number" ? sizeValue : Number(String(sizeValue).trim().replace(",", "."))
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return modifierToNumber(calculateSizeModifier(String(raw / 100), "2"))
}

export function calculateAffinity(essenceValue: string): { affinity: string; efficiency: string } {
  const essences = Math.max(0, Math.trunc(parseNumber(essenceValue) ?? 0))
  let affinityLevel = 0
  let efficiency = 0

  for (let level = 0; level < ESSENCE_THRESHOLDS.length; level += 1) {
    for (let step = 0; step < ESSENCE_THRESHOLDS[level].length; step += 1) {
      if (essences >= ESSENCE_THRESHOLDS[level][step]) {
        affinityLevel = level
        efficiency = step * 10
      }
    }
  }

  return {
    affinity: `${AFFINITY_NAMES[affinityLevel]} (${affinityLevel})`,
    efficiency: String(efficiency),
  }
}

export function calculateAlignment(karmaValue: string): string {
  const karma = Math.max(-60, Math.min(60, Math.trunc(parseNumber(karmaValue) ?? 0)))
  if (karma >= 41) return "Ascendido (4)"
  if (karma >= 25) return "Iluminado (3)"
  if (karma >= 13) return "Seguidor (2)"
  if (karma >= 5) return "Leal (1)"
  if (karma <= -41) return "Soberano (4)"
  if (karma <= -25) return "Indômito (3)"
  if (karma <= -13) return "Pactário (2)"
  if (karma <= -5) return "Caótico (1)"
  return "Neutro (0)"
}

export function calculateLegacyRarity(pointsValue: string): string {
  const points = Math.max(0, Math.trunc(parseNumber(pointsValue) ?? 0))
  if (points >= 160) return "Lendário (+5)"
  if (points >= 80) return "Místico (+4)"
  if (points >= 40) return "Épico (+3)"
  if (points >= 20) return "Raro (+2)"
  if (points >= 10) return "Incomum (+1)"
  return "Comum (+0)"
}

export function convertCalendarYear(yearValue: string, from: CharacterCalendar, to: CharacterCalendar): string {
  const year = Math.trunc(parseNumber(yearValue) ?? 424)
  if (from === to) return String(year)
  return String(to === "ce" ? year + CALENDAR_OFFSET : year - CALENDAR_OFFSET)
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function parseBirthYear(value: string): { year: number; calendar: CharacterCalendar } | null {
  const normalized = normalizeText(value).replace(/−/g, "-")
  const calendar: CharacterCalendar | null = normalized.includes("logi")
    ? "logi"
    : /(^|\s)(c\s*\.?\s*e\.?|calendario elfico|calendario elfo|elfico|elfo)(\s|$)/.test(normalized)
      ? "ce"
      : null
  if (!calendar) return null

  // O sinal pertence ao número do ano. Ex.: "01/12/-100 C.E.".
  const numbers = normalized.match(/[+-]?\d+/g)?.map(Number) ?? []
  if (numbers.length !== 1 && numbers.length !== 3) return null

  if (numbers.length === 3) {
    const month = numbers[1]
    const day = calendar === "logi" ? numbers[2] : numbers[0]
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
  }

  return { year: numbers.length === 1 ? numbers[0] : calendar === "logi" ? numbers[0] : numbers[2], calendar }
}

export function calculateAge(
  birthDate: string,
  currentYearValue: string,
  currentCalendar: CharacterCalendar,
): string {
  const birth = parseBirthYear(birthDate)
  const currentYear = parseNumber(currentYearValue)
  if (!birth || currentYear === null) return ""

  const birthYearLogi = birth.calendar === "logi" ? birth.year : birth.year - CALENDAR_OFFSET
  const currentYearLogi = currentCalendar === "logi" ? currentYear : currentYear - CALENDAR_OFFSET
  const age = Math.trunc(currentYearLogi - birthYearLogi)
  return age >= 0 ? String(age) : ""
}

export function deriveCharacterInfo(info: CharacterInfo): CharacterInfo {
  const essenceResult = calculateAffinity(info.essences)
  const scaleMultiplier = calculateScaleMultiplier(info.sizeReal, info.sizeBase)
  return {
    ...info,
    sizeModifier: calculateSizeModifier(info.sizeReal, info.sizeModifierBonus),
    scaleMultiplier,
    weightReal: calculateRealWeight(info.weightBase, scaleMultiplier, info.weightBonus),
    age: calculateAge(info.birthDate, info.currentYear, info.calendar),
    affinity: essenceResult.affinity,
    efficiency: essenceResult.efficiency,
    alignment: calculateAlignment(info.karma),
    legacyRarity: calculateLegacyRarity(info.legacyPoints),
  }
}

export function modifierToNumber(value: string): number {
  return Math.trunc(parseNumber(value) ?? 0)
}
