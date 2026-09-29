import { createEmptyCharacter as createCoreCharacter, normalizeCharacter } from "@runas/core/lib/characterStorage"
import { synchronizeCharacterDerivedValues } from "@runas/core/lib/characterSynchronization"
import { createId } from "@runas/core/lib/ids"
import type { Character } from "@runas/core/types/character"
import { isRulesetId, type RulesetId } from "@runas/ruleset-contracts"

export interface BestiaryEntry {
  id: string
  character: Character
  masteryTableId: string
  updatedAt: number
}

export interface EncounterActor {
  id: string
  sourceId: string
  copyNumber: number
  character: Character
  masteryTableId: string
}

export interface MasteryTable {
  id: string
  name: string
  multiplier: number
}

export interface InitiativeEntry {
  id: string
  actorId: string | null
  name: string
  value: number | null
}

export interface RunasDmState {
  version: 2
  /**
   * Id do bestiário dono deste estado. Opcional para não quebrar nenhum
   * leitor existente (backup antigo, teste, importação) que ainda não sabe
   * de múltiplos bestiários; `normalizeRunasDmState` sempre devolve um valor
   * válido, caindo em `DEFAULT_BESTIARY_COLLECTION_ID` na ausência de um.
   */
  collectionId?: string
  entries: BestiaryEntry[]
  encounter: EncounterActor[]
  masteryTables: MasteryTable[]
  workspaceNotesHtml: string
  initiative: InitiativeEntry[]
  updatedAt: number
}

/** Id do bestiário que já existia antes de bestiários múltiplos existirem. */
export const DEFAULT_BESTIARY_COLLECTION_ID = "default"
const DEFAULT_BESTIARY_NAME = "Bestiário"

/** Um bestiário do registro: nome de exibição e o sistema fixo escolhido na criação. */
export interface BestiaryCollectionMeta {
  id: string
  name: string
  system: RulesetId
  createdAt: number
  updatedAt: number
}

/** A lista de bestiários deste dispositivo e qual deles está aberto agora. */
export interface BestiaryRegistry {
  version: 1
  collections: BestiaryCollectionMeta[]
  activeCollectionId: string
}

/** Um dispositivo novo (ou um dispositivo que ainda não tinha o registro) começa só com o bestiário padrão, em Livro Azul. */
export function createDefaultBestiaryRegistry(now = Date.now()): BestiaryRegistry {
  return {
    version: 1,
    collections: [{ id: DEFAULT_BESTIARY_COLLECTION_ID, name: DEFAULT_BESTIARY_NAME, system: "runas-blue", createdAt: now, updatedAt: now }],
    activeCollectionId: DEFAULT_BESTIARY_COLLECTION_ID,
  }
}

export function createBestiaryCollection(name: string, system: RulesetId, now = Date.now()): BestiaryCollectionMeta {
  return { id: createId(), name: name.trim() || DEFAULT_BESTIARY_NAME, system, createdAt: now, updatedAt: now }
}

/**
 * Normaliza um registro salvo (ou lido de outro dispositivo). Sempre garante
 * pelo menos o bestiário padrão e uma coleção ativa que exista de verdade —
 * nunca perde uma coleção por um dado malformado.
 */
export function normalizeBestiaryRegistry(value: unknown): BestiaryRegistry {
  if (!value || typeof value !== "object") return createDefaultBestiaryRegistry()
  const candidate = value as Partial<BestiaryRegistry>
  const now = Date.now()
  const seenIds = new Set<string>()
  const collections = (Array.isArray(candidate.collections) ? candidate.collections : []).flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as Partial<BestiaryCollectionMeta>
    if (typeof record.id !== "string" || !record.id.trim() || seenIds.has(record.id)) return []
    seenIds.add(record.id)
    return [{
      id: record.id,
      name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : DEFAULT_BESTIARY_NAME,
      system: isRulesetId(record.system) ? record.system : "runas-blue",
      createdAt: Number.isFinite(record.createdAt) ? record.createdAt as number : now,
      updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt as number : now,
    }]
  })
  if (collections.length === 0) return createDefaultBestiaryRegistry(now)
  const activeCollectionId = typeof candidate.activeCollectionId === "string" && collections.some((collection) => collection.id === candidate.activeCollectionId)
    ? candidate.activeCollectionId
    : collections[0].id
  return { version: 1, collections, activeCollectionId }
}

export function createEmptyCharacter(name = "Nova criatura"): Character {
  const character = createCoreCharacter()
  character.name = name
  return character
}

function sampleSentinel(): Character {
  const character = createEmptyCharacter("Sentinela de Vidro")
  character.info.race = "Constructo"
  character.info.affinity = "Afinidade 3 (Raro)"
  character.info.efficiency = "60"
  character.info.essences = "180"
  character.attributes = { ...character.attributes, physical: 9, mental: 5, mystic: 8, strength: 4, dexterity: 2, vitality: 5, intelligence: 1, knowledge: 3, social: -2, faith: 2, power: 4, luck: 0 }
  character.stats = { ...character.stats, pv: 62, pa: 34, paExtra: 12, pe: 22, peTemporary: 8, elementId: "cristal", resistances: ["Cortante", "Queimadura"], weaknesses: ["Contundente", "Impacto"], armorRdf: 4, armorRdm: 2, movementBonus: 1 }
  character.skills = [...character.skills, { id: "sample-1", name: "Vigilância", attributeKey: "knowledge", points: 10, modifier: 2, locked: false }]
  character.abilities = [
    { id: "ability-1", category: "Racial", name: "Corpo Prismático", description: "", permanentModifiers: "", costType: "none", costMode: "fixed", costValue: 0, costText: "" },
    { id: "ability-2", category: "Combate", name: "Estilhaçar", description: "Explode fragmentos ao redor.", permanentModifiers: "", costType: "none", costMode: "fixed", costValue: 0, costText: "" },
  ]
  character.inventory = [{ id: "item-1", usage: "equipped", name: "Lança de cristal", type: "weapon", affinity: 2, bondPoints: 0, baseWeight: 3, size: 0, mt: 0, quantity: 1, applyScaleWeight: false, damage: "4D+2 perfurante", rdf: 4, rdm: 2, equippedAsArmor: true, prCurrent: null, prMaximum: null, abilityIds: [], spellIds: [], bondId: "", skillId: "sample-1", description: "" }]
  return synchronizeCharacterDerivedValues(character, character)
}

function sampleAshBeast(): Character {
  const character = createEmptyCharacter("Fera das Cinzas")
  character.info.race = "Animal"
  character.info.affinity = "Afinidade 2 (Incomum)"
  character.info.efficiency = "40"
  character.info.essences = "90"
  character.attributes = { ...character.attributes, physical: 10, mental: 3, mystic: 5, strength: 5, dexterity: 4, vitality: 3, intelligence: -2, knowledge: 1, social: -3, faith: 0, power: 2, luck: 1 }
  character.stats = { ...character.stats, pv: 48, pa: 16, pe: 12, peTemporary: 0, elementId: "fogo", resistances: ["Queimadura", "Corrosivo"], weaknesses: ["Congelante"], naturalRdf: 2, movementBonus: 4 }
  character.skills = [...character.skills, { id: "sample-2", name: "Rastreio", attributeKey: "knowledge", points: 6, modifier: 1, locked: false }]
  character.abilities = [{ id: "ability-3", category: "Racial", name: "Faro de Fumaça", description: "", permanentModifiers: "", costType: "none", costMode: "fixed", costValue: 0, costText: "" }]
  character.inventory = [{ id: "item-2", usage: "equipped", name: "Garras em brasa", type: "weapon", affinity: 1, bondPoints: 0, baseWeight: 0, size: 0, mt: 0, quantity: 1, applyScaleWeight: false, damage: "3D+3 cortante", rdf: 0, rdm: 0, equippedAsArmor: false, prCurrent: null, prMaximum: null, abilityIds: [], spellIds: [], bondId: "", skillId: "", description: "" }]
  return synchronizeCharacterDerivedValues(character, character)
}

/** Ids das duas fichas de exemplo que um bestiário novo recebe; só elas = dispositivo ainda sem dados do mestre. */
export const SAMPLE_ENTRY_IDS: readonly string[] = ["sentinela-vidro", "fera-cinzas"]

export function defaultMasteryTables(): MasteryTable[] {
  return [
    { id: "default", name: "Padrão", multiplier: 1 },
    { id: "double", name: "Pontos dobrados", multiplier: 2 },
  ]
}

export function createInitialState(): RunasDmState {
  const now = Date.now()
  return {
    version: 2,
    collectionId: DEFAULT_BESTIARY_COLLECTION_ID,
    entries: [
      { id: SAMPLE_ENTRY_IDS[0], character: sampleSentinel(), masteryTableId: "default", updatedAt: now },
      { id: SAMPLE_ENTRY_IDS[1], character: sampleAshBeast(), masteryTableId: "default", updatedAt: now },
    ],
    encounter: [],
    masteryTables: defaultMasteryTables(),
    workspaceNotesHtml: "",
    initiative: [],
    updatedAt: now,
  }
}

/** Um bestiário novo (criado pelo mestre) começa vazio: as fichas de exemplo só fazem sentido no bestiário padrão. */
export function createEmptyRunasDmState(collectionId: string): RunasDmState {
  return { ...createInitialState(), collectionId, entries: [] }
}

/** Normaliza dados antigos/importados com as regras atuais sem restaurar recursos gastos. */
export function normalizeRunasDmState(state: RunasDmState): RunasDmState {
  // O backup da nuvem e o arquivo do vault não levam a Mesa (encounter, iniciativa, notas),
  // então qualquer coleção pode faltar; sem tabelas de maestria valem as padrão.
  const masteryTables = Array.isArray(state.masteryTables) ? state.masteryTables : defaultMasteryTables()
  const masteryTableIds = new Set(masteryTables.map((table) => table.id))
  const normalizeMasteryTableId = (value: unknown) => typeof value === "string" && masteryTableIds.has(value) ? value : "default"
  return {
    ...state,
    version: 2,
    collectionId: typeof state.collectionId === "string" && state.collectionId.trim() ? state.collectionId.trim() : DEFAULT_BESTIARY_COLLECTION_ID,
    masteryTables,
    workspaceNotesHtml: typeof state.workspaceNotesHtml === "string" ? state.workspaceNotesHtml : "",
    initiative: Array.isArray(state.initiative) ? state.initiative.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") return []
      const candidate = entry as InitiativeEntry
      const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 100) : ""
      if (!name) return []
      return [{ id: typeof candidate.id === "string" && candidate.id ? candidate.id : `initiative-${index + 1}`, actorId: typeof candidate.actorId === "string" ? candidate.actorId : null, name, value: typeof candidate.value === "number" && Number.isFinite(candidate.value) ? Math.trunc(candidate.value) : null }]
    }) : [],
    entries: (Array.isArray(state.entries) ? state.entries : []).map((entry) => ({
      ...entry,
      character: normalizeCharacter(entry.character),
      masteryTableId: normalizeMasteryTableId(entry.masteryTableId),
    })),
    encounter: (Array.isArray(state.encounter) ? state.encounter : []).map((actor) => ({
      ...actor,
      character: normalizeCharacter(actor.character),
      masteryTableId: normalizeMasteryTableId(actor.masteryTableId),
    })),
  }
}

export function cloneCharacter(character: Character): Character {
  return structuredClone(character)
}

export function actionsAndAbilities(character: Character): string[] {
  return [
    ...character.inventory.filter((item) => item.usage === "equipped").map((item) => item.name),
    ...character.abilities.filter((ability) => ability.category.toLocaleLowerCase("pt-BR") !== "racial").map((ability) => ability.name),
    ...character.spells.map((spell) => `${spell.name} ${spell.category}`.trim()),
  ].filter(Boolean)
}

export function racialCharacteristics(character: Character): string[] {
  return character.abilities
    .filter((ability) => ability.category.toLocaleLowerCase("pt-BR") === "racial")
    .map((ability) => ability.name)
    .filter(Boolean)
}

export function essenceYield(character: Character): number {
  const total = Number(character.info.essences.replace(",", "."))
  return Number.isFinite(total) ? Math.max(0, Math.floor(total / 10)) : 0
}

/** Imagem que representa a ficha na interface: o token (versão 21) ou, na falta dele, o retrato. */
export function characterImage(character: Pick<Character, "tokenImageDataUrl" | "portraitDataUrl"> | null | undefined): string | undefined {
  return character?.tokenImageDataUrl ?? character?.portraitDataUrl
}
