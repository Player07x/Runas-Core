import type { CharacterInventoryItem, InventoryItemType, InventoryUsage } from "../types/character"
import { calculateLegacyRarity } from "./characterCalculations"

export const inventoryUsageOptions: { value: InventoryUsage; label: string }[] = [
  { value: "equipped", label: "Equipado" },
  { value: "stored", label: "Armazenado" },
  { value: "absent", label: "Ausente" },
]

export const inventoryTypeOptions: { value: InventoryItemType; label: string }[] = [
  { value: "innate", label: "Inato" },
  { value: "weapon", label: "Arma" },
  { value: "armor", label: "Armadura" },
  { value: "shield", label: "Escudo" },
  { value: "artifact", label: "Artefato" },
  { value: "material", label: "Material" },
  { value: "consumable", label: "Consumível" },
  { value: "tool", label: "Ferramenta" },
  { value: "utility", label: "Utilitário" },
  { value: "accessory", label: "Acessório" },
  { value: "currency", label: "Moeda" },
  { value: "other", label: "Outro" },
]

export const itemAffinityOptions = [
  { value: 0, label: "Ordinário (0)" },
  { value: 1, label: "Notável (1)" },
  { value: 2, label: "Impressionante (2)" },
  { value: 3, label: "Excepcional (3)" },
  { value: 4, label: "Extraordinário (4)" },
] as const

export function inventoryUsageLabel(value: InventoryUsage): string {
  return inventoryUsageOptions.find((option) => option.value === value)?.label ?? "Armazenado"
}

export function inventoryTypeLabel(value: InventoryItemType): string {
  return inventoryTypeOptions.find((option) => option.value === value)?.label ?? "Outro"
}

/** Itens inatos existem no personagem ou estão ausentes; nunca ficam armazenados. */
export function normalizeInventoryUsage(type: InventoryItemType, usage: InventoryUsage): InventoryUsage {
  return type === "innate" && usage === "stored" ? "equipped" : usage
}

export function parseScaleMultiplier(value: string): number {
  const parsed = Number(value.trim().replace(/x/gi, "").replace(",", "."))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
}

export function calculateItemRealWeight(item: Pick<CharacterInventoryItem, "baseWeight" | "quantity" | "applyScaleWeight">, scaleMultiplier: string): number {
  const baseWeight = Math.max(0, Number.isFinite(item.baseWeight) ? item.baseWeight : 0)
  const quantity = Math.max(1, Number.isFinite(item.quantity) ? Math.trunc(item.quantity) : 1)
  const multiplier = item.applyScaleWeight ? parseScaleMultiplier(scaleMultiplier) : 1
  return Number((baseWeight * multiplier ** 3 * quantity).toFixed(3))
}

export function calculateInventoryLoad(items: CharacterInventoryItem[], scaleMultiplier: string): number {
  const total = items.reduce((sum, item) => (
    item.usage === "absent" ? sum : sum + calculateItemRealWeight(item, scaleMultiplier)
  ), 0)
  return Number(total.toFixed(3))
}

export function calculateEquippedArmorDefense(items: CharacterInventoryItem[]): { rdf: number; rdm: number } {
  const armor = items.find((item) => item.usage === "equipped" && item.equippedAsArmor)
  return armor
    ? { rdf: Math.max(0, Math.trunc(armor.rdf)), rdm: Math.max(0, Math.trunc(armor.rdm)) }
    : { rdf: 0, rdm: 0 }
}

export function itemRarity(points: number): string {
  return calculateLegacyRarity(String(Math.max(0, Math.trunc(points))))
}

export function isBondAbilityCategory(category: string): boolean {
  return category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR") === "vinculo"
}

export function formatWeight(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value)
}

/**
 * O tamanho do item é guardado em centímetros — é o que `calculateItemSizeModifier`
 * espera e o que as fichas já gravadas contêm —, mas é lido e escrito em metros,
 * na mesma unidade da altura do personagem e da tabela de MT.
 */
export function metersFromCentimeters(centimeters: number): number {
  const value = Number.isFinite(centimeters) ? centimeters : 0
  return Math.round(value) / 100
}

export function centimetersFromMeters(meters: number): number {
  const value = Number.isFinite(meters) ? meters : 0
  return Math.max(0, Math.round(value * 100))
}

/** Tamanho do item para leitura: `1,7 m`, ou um travessão quando não informado. */
export function formatItemSize(centimeters: number): string {
  if (!Number.isFinite(centimeters) || centimeters <= 0) return "—"
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(metersFromCentimeters(centimeters))} m`
}
