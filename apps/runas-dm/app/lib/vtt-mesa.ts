"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { characterFromVttToken, getRunasVtt, masteryTableIdFromVttToken, summarizeCharacterResources, toVttCharacter, vttEnvelopeFor, VTT_MAX_IMPORT_BATCH, type RunasVttBridge, type VttLogEntry, type VttToken } from "@runas/vtt-bridge"
import type { Character } from "@runas/core/types/character"
import type { BestiaryEntry, EncounterActor } from "./model"

const noSubscription = () => () => undefined

/** A ponte do RunasVTT, ou `null` fora dele (e sempre `null` na renderização do servidor). */
export function useRunasVtt(): RunasVttBridge | null {
  return useSyncExternalStore(noSubscription, () => getRunasVtt(window), () => null)
}

/**
 * Converte os tokens com ficha da cena aberta no RunasVTT em atores da Mesa.
 * O id do ator é o id do token; tokens de mesmo nome são numerados na ordem
 * da cena, como as cópias da Mesa local.
 */
export function actorsFromVttTokens(tokens: VttToken[]): EncounterActor[] {
  const counts = new Map<string, number>()
  return tokens.flatMap((token) => {
    try {
      const character = characterFromVttToken(token)
      const copyNumber = (counts.get(character.name) ?? 0) + 1
      counts.set(character.name, copyNumber)
      return [{ id: token.id, sourceId: token.id, copyNumber, character, masteryTableId: masteryTableIdFromVttToken(token, "default") }]
    } catch {
      return []
    }
  })
}

/** Quanto a ficha perdeu em PA Extra, PA e PV, para o texto que sobe no token. */
export function resourceLoss(before: Character, after: Character): number {
  const lost = (key: "paExtra" | "pa" | "pv") => Math.max(0, before.stats[key] - after.stats[key])
  return lost("paExtra") + lost("pa") + lost("pv")
}

export interface VttMesa {
  bridge: RunasVttBridge
  actors: EncounterActor[]
  /** Token selecionado no RunasVTT, usado como alvo preferido do dano. */
  selectedTokenId: string | null
  sendEntries(entries: Pick<BestiaryEntry, "character" | "masteryTableId">[]): Promise<number>
  updateActor(actorId: string, character: Character, masteryTableId: string): Promise<void>
  log(entry: VttLogEntry): void
}

/**
 * Mesa do Runas DM dentro do RunasVTT (ADR 0006 do RunasVTT): os atores são
 * os tokens da cena, e toda alteração num ator grava a ficha no token.
 * Devolve `null` fora do VTT, e a Mesa local segue como sempre.
 */
export function useVttMesa(onError: (message: string) => void): VttMesa | null {
  const bridge = useRunasVtt()
  const [tokens, setTokens] = useState<VttToken[]>([])

  useEffect(() => {
    if (!bridge) return
    let active = true
    const load = () => { void bridge.getTokens().then((next) => { if (active) setTokens(next) }).catch(() => undefined) }
    load()
    const unsubscribe = bridge.onTokensChanged(load)
    return () => { active = false; unsubscribe() }
  }, [bridge])

  const actors = useMemo(() => actorsFromVttTokens(tokens), [tokens])
  const fail = useCallback((error: unknown) => onError(error instanceof Error ? error.message : "O RunasVTT recusou a operação."), [onError])

  return useMemo(() => bridge ? {
    bridge,
    actors,
    selectedTokenId: tokens.find((token) => token.selected)?.id ?? null,
    async sendEntries(entries) {
      try {
        let sent = 0
        for (let offset = 0; offset < entries.length; offset += VTT_MAX_IMPORT_BATCH) {
          const batch = entries.slice(offset, offset + VTT_MAX_IMPORT_BATCH).map((entry) => toVttCharacter(entry.character, "dm", { runasDm: { masteryTableId: entry.masteryTableId } }))
          const { tokenIds } = await bridge.importCharacters(batch)
          sent += tokenIds.length
        }
        return sent
      } catch (error) {
        fail(error)
        return 0
      }
    },
    async updateActor(actorId, character, masteryTableId) {
      const envelope = vttEnvelopeFor(character, { runasDm: { masteryTableId } })
      // Mostra a mudança na hora; a confirmação do VTT chega pelo aviso de tokens.
      setTokens((current) => current.map((token) => token.id === actorId ? { ...token, envelope } : token))
      await bridge.updateTokenCharacter(actorId, envelope, summarizeCharacterResources(character)).catch(fail)
    },
    log(entry) {
      void bridge.postLog(entry).catch(() => undefined)
    },
  } : null, [actors, bridge, fail, tokens])
}
