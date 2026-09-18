import { createCharacterSaveFile, summarizeCharacterResources, type CharacterResourceSummary } from "@runas/core/lib/characterSummary"
import { parseCharacterFile } from "@runas/core/lib/characterStorage"
import type { Character } from "@runas/core/types/character"

/**
 * Contrato da ponte `window.runasVTT`, injetada pelo RunasVTT
 * (github.com/Player07x/RunasVTT, `src/shared/bridge.ts`) somente quando
 * um site da suíte roda dentro do navegador integrado dele.
 *
 * O VTT não calcula regra nenhuma: recebe a ficha como envelope opaco e o
 * resumo das barras já calculado aqui. Mudança incompatível exige aumentar
 * `VTT_BRIDGE_PROTOCOL` nos dois repositórios.
 */
export const VTT_BRIDGE_PROTOCOL = 1
/** Mesmo limite validado pelo RunasVTT em cada chamada de importação. */
export const VTT_MAX_IMPORT_BATCH = 50

export type VttCharacterSource = "tools" | "dm"

export interface VttCharacter {
  envelope: VttEnvelope
  summary: CharacterResourceSummary
  source: VttCharacterSource
  /** Imagem do token em data URL; hoje, o retrato da ficha. */
  tokenImage: string | null
}

/** Envelope `{ version, character }` com dados extras do app de origem, ignorados pelo resto da suíte. */
export interface VttEnvelope {
  version: number
  character: Character
  runasDm?: { masteryTableId: string }
}

export interface VttToken {
  id: string
  sceneId: string
  name: string
  selected: boolean
  source: VttCharacterSource
  envelope: unknown
  summary: { name: string; bars: { label: string; value: number; max: number }[] }
}

export interface VttLogEntry {
  kind?: "test" | "damage" | "info"
  title: string
  detail?: string
  tokenId?: string | null
  floatingText?: string
}

export interface RunasVttBridge {
  protocol: number
  importCharacters(items: VttCharacter[]): Promise<{ tokenIds: string[] }>
  getTokens(): Promise<VttToken[]>
  onTokensChanged(listener: () => void): () => void
  updateTokenCharacter(tokenId: string, envelope: VttEnvelope, summary: CharacterResourceSummary): Promise<void>
  postLog(entry: VttLogEntry): Promise<void>
}

/**
 * A ponte, se o site estiver dentro do RunasVTT com um protocolo
 * compatível; `null` num navegador comum (o comportamento normal do site).
 */
export function getRunasVtt(scope: unknown = globalThis): RunasVttBridge | null {
  const bridge = (scope as { runasVTT?: Partial<RunasVttBridge> } | undefined)?.runasVTT
  return bridge && bridge.protocol === VTT_BRIDGE_PROTOCOL
    && typeof bridge.importCharacters === "function"
    && typeof bridge.getTokens === "function"
    && typeof bridge.onTokensChanged === "function"
    && typeof bridge.updateTokenCharacter === "function"
    && typeof bridge.postLog === "function"
    ? bridge as RunasVttBridge
    : null
}

export function toVttCharacter(character: Character, source: VttCharacterSource, extras: Pick<VttEnvelope, "runasDm"> = {}): VttCharacter {
  return {
    envelope: { ...createCharacterSaveFile(character), ...extras },
    summary: summarizeCharacterResources(character),
    source,
    tokenImage: character.portraitDataUrl?.startsWith("data:image/") ? character.portraitDataUrl : null,
  }
}

/** Reconstrói a ficha guardada num token, pela mesma migração da suíte. */
export function characterFromVttToken(token: Pick<VttToken, "envelope">): Character {
  return parseCharacterFile(JSON.stringify(token.envelope))
}

export function vttEnvelopeFor(character: Character, extras: Pick<VttEnvelope, "runasDm"> = {}): VttEnvelope {
  return { ...createCharacterSaveFile(character), ...extras }
}

/** Tabela de maestria guardada pelo Runas DM no envelope do token. */
export function masteryTableIdFromVttToken(token: Pick<VttToken, "envelope">, fallback: string): string {
  const id = (token.envelope as Partial<VttEnvelope> | null)?.runasDm?.masteryTableId
  return typeof id === "string" && id ? id : fallback
}

export { summarizeCharacterResources }
