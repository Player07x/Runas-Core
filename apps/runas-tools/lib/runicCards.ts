import { characterElements } from "@runas/core/data/elements"
import { createPrefixedId } from "@runas/core/lib/ids"

export const RUNIC_CARD_SCHEMA = "runas-tools/runic-card" as const
export const RUNIC_CARD_VERSION = 2 as const
export const RUNIC_CARD_GALLERY_SCHEMA = "runas-tools/runic-card-gallery" as const
export const RUNIC_CARD_GALLERY_LIMIT = 200

export const runicCardKinds = [
  { value: "adventurer", label: "Aventureiro" },
  { value: "troop", label: "Tropa" },
  { value: "spell", label: "Magia" },
  { value: "equipment", label: "Equipamento" },
] as const

export type RunicCardKind = (typeof runicCardKinds)[number]["value"]

export const runicCardRarities = [
  { value: "common", label: "Comum", copies: 6 },
  { value: "uncommon", label: "Incomum", copies: 5 },
  { value: "rare", label: "Raro", copies: 4 },
  { value: "epic", label: "Épico", copies: 3 },
  { value: "mystic", label: "Místico", copies: 2 },
  { value: "legendary", label: "Lendário", copies: 1 },
] as const

export type RunicCardRarity = (typeof runicCardRarities)[number]["value"]
export type RunicDamageKind = "physical" | "magical" | "hybrid"

export interface RunicCard {
  id: string
  kind: RunicCardKind
  name: string
  type: string
  rarity: RunicCardRarity
  elementId: string
  cost: number
  energyGain: number
  life: number
  aura: number
  damage: number
  damageKind: RunicDamageKind
  rulesHtml: string
  flavorText: string
  artDataUrl: string
  edition: string
}

export interface RunicCardGalleryFile {
  schema: typeof RUNIC_CARD_GALLERY_SCHEMA
  version: typeof RUNIC_CARD_VERSION
  exportedAt: string
  cards: RunicCard[]
}

export interface RunicCardFile {
  schema: typeof RUNIC_CARD_SCHEMA
  version: typeof RUNIC_CARD_VERSION
  exportedAt: string
  card: RunicCard
}

const DEFAULT_RULES = "<p><strong>Habilidade.</strong></p><p>Descreva aqui o efeito da carta.</p>"

export function createEmptyRunicCard(kind: RunicCardKind = "troop"): RunicCard {
  return {
    id: createPrefixedId("card"),
    kind,
    name: kind === "adventurer" ? "Novo Aventureiro" : "Nova Carta",
    type: runicCardKinds.find((entry) => entry.value === kind)?.label ?? "Carta",
    rarity: "common",
    elementId: "arcano",
    cost: 4,
    energyGain: 1,
    life: kind === "adventurer" ? 40 : 4,
    aura: kind === "adventurer" ? 0 : 3,
    damage: kind === "adventurer" ? 5 : 1,
    damageKind: "physical",
    rulesHtml: DEFAULT_RULES,
    flavorText: "Uma frase curta que revela algo sobre a história desta carta.",
    artDataUrl: "",
    edition: "Primeira Edição",
  }
}

function finiteInteger(value: unknown, fallback: number, min = 0, max = 999): number {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback
}

function safeText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback
}

function isCardKind(value: unknown): value is RunicCardKind {
  return runicCardKinds.some((entry) => entry.value === value)
}

function isRarity(value: unknown): value is RunicCardRarity {
  return runicCardRarities.some((entry) => entry.value === value)
}

function isDamageKind(value: unknown): value is RunicDamageKind {
  return value === "physical" || value === "magical" || value === "hybrid"
}

export function normalizeRunicCard(value: unknown): RunicCard {
  const candidate = value && typeof value === "object" && "card" in value
    ? (value as { card?: unknown }).card
    : value
  if (!candidate || typeof candidate !== "object") throw new Error("O arquivo não contém uma carta válida.")

  const source = candidate as Partial<RunicCard>
  const kind = isCardKind(source.kind) ? source.kind : "troop"
  const fallback = createEmptyRunicCard(kind)
  const elementId = characterElements.some((element) => element.id === source.elementId) ? source.elementId! : fallback.elementId
  const artDataUrl = typeof source.artDataUrl === "string" && /^data:image\/(?:png|jpeg|webp);base64,/i.test(source.artDataUrl)
    ? source.artDataUrl
    : ""

  return {
    id: safeText(source.id, fallback.id, 120),
    kind,
    name: safeText(source.name, fallback.name, 80),
    type: safeText(source.type, fallback.type, 80),
    rarity: isRarity(source.rarity) ? source.rarity : fallback.rarity,
    elementId,
    cost: finiteInteger(source.cost, fallback.cost, 0, 10),
    energyGain: finiteInteger(source.energyGain, fallback.energyGain, 0, 10),
    life: finiteInteger(source.life, fallback.life, 0, 999),
    aura: finiteInteger(source.aura, fallback.aura, 0, 999),
    damage: finiteInteger(source.damage, fallback.damage, 0, 999),
    damageKind: isDamageKind(source.damageKind) ? source.damageKind : fallback.damageKind,
    rulesHtml: safeText(source.rulesHtml, fallback.rulesHtml, 6000),
    flavorText: safeText(source.flavorText, fallback.flavorText, 500),
    artDataUrl,
    edition: safeText(source.edition, fallback.edition, 80),
  }
}

export function createRunicCardGalleryFile(cards: RunicCard[]): RunicCardGalleryFile {
  return { schema: RUNIC_CARD_GALLERY_SCHEMA, version: RUNIC_CARD_VERSION, exportedAt: new Date().toISOString(), cards }
}

export function normalizeRunicCardCollection(value: unknown): RunicCard[] {
  if (value && typeof value === "object" && "cards" in value && Array.isArray((value as { cards?: unknown }).cards)) {
    return (value as { cards: unknown[] }).cards.slice(0, RUNIC_CARD_GALLERY_LIMIT).flatMap((card) => {
      try { return [normalizeRunicCard(card)] } catch { return [] }
    })
  }
  return [normalizeRunicCard(value)]
}

export function createRunicCardFile(card: RunicCard): RunicCardFile {
  return {
    schema: RUNIC_CARD_SCHEMA,
    version: RUNIC_CARD_VERSION,
    exportedAt: new Date().toISOString(),
    card,
  }
}

export function getRarity(rarity: RunicCardRarity) {
  return runicCardRarities.find((entry) => entry.value === rarity) ?? runicCardRarities[0]
}

export function getDamageLabel(kind: RunicDamageKind): string {
  if (kind === "magical") return "MAG"
  if (kind === "hybrid") return "FIS/MAG"
  return "FIS"
}

export function cardFilename(card: RunicCard, extension: "json" | "png"): string {
  const slug = card.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "carta-runica"
  return `${slug}.${extension}`
}
