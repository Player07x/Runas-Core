import { createEmptyCharacter as createCoreCharacter, normalizeCharacter } from "@runas/core/lib/characterStorage"
import { synchronizeCharacterDerivedValues } from "@runas/core/lib/characterSynchronization"
import type { Character } from "@runas/core/types/character"

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
  entries: BestiaryEntry[]
  encounter: EncounterActor[]
  masteryTables: MasteryTable[]
  workspaceNotesHtml: string
  initiative: InitiativeEntry[]
  updatedAt: number
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
  character.inventory = [{ id: "item-1", usage: "equipped", name: "Lança de cristal", type: "weapon", affinity: 2, bondPoints: 0, baseWeight: 3, quantity: 1, applyScaleWeight: false, damage: "4D+2 perfurante", rdf: 4, rdm: 2, equippedAsArmor: true, prCurrent: null, prMaximum: null, enchantmentSpellId: "", bondId: "", bondAbilityId: "", skillId: "sample-1", description: "" }]
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
  character.inventory = [{ id: "item-2", usage: "equipped", name: "Garras em brasa", type: "weapon", affinity: 1, bondPoints: 0, baseWeight: 0, quantity: 1, applyScaleWeight: false, damage: "3D+3 cortante", rdf: 0, rdm: 0, equippedAsArmor: false, prCurrent: null, prMaximum: null, enchantmentSpellId: "", bondId: "", bondAbilityId: "", skillId: "", description: "" }]
  return synchronizeCharacterDerivedValues(character, character)
}

export function createInitialState(): RunasDmState {
  const now = Date.now()
  return {
    version: 2,
    entries: [
      { id: "sentinela-vidro", character: sampleSentinel(), masteryTableId: "default", updatedAt: now },
      { id: "fera-cinzas", character: sampleAshBeast(), masteryTableId: "default", updatedAt: now },
    ],
    encounter: [],
    masteryTables: [
      { id: "default", name: "Padrão", multiplier: 1 },
      { id: "double", name: "Pontos dobrados", multiplier: 2 },
    ],
    workspaceNotesHtml: "",
    initiative: [],
    updatedAt: now,
  }
}

/** Normaliza dados antigos/importados com as regras atuais sem restaurar recursos gastos. */
export function normalizeRunasDmState(state: RunasDmState): RunasDmState {
  const masteryTableIds = new Set(state.masteryTables.map((table) => table.id))
  const normalizeMasteryTableId = (value: unknown) => typeof value === "string" && masteryTableIds.has(value) ? value : "default"
  return {
    ...state,
    version: 2,
    workspaceNotesHtml: typeof state.workspaceNotesHtml === "string" ? state.workspaceNotesHtml : "",
    initiative: Array.isArray(state.initiative) ? state.initiative.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") return []
      const candidate = entry as InitiativeEntry
      const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 100) : ""
      if (!name) return []
      return [{ id: typeof candidate.id === "string" && candidate.id ? candidate.id : `initiative-${index + 1}`, actorId: typeof candidate.actorId === "string" ? candidate.actorId : null, name, value: typeof candidate.value === "number" && Number.isFinite(candidate.value) ? Math.trunc(candidate.value) : null }]
    }) : [],
    entries: state.entries.map((entry) => ({
      ...entry,
      character: normalizeCharacter(entry.character),
      masteryTableId: normalizeMasteryTableId(entry.masteryTableId),
    })),
    encounter: state.encounter.map((actor) => ({
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
