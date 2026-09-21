import { getRunasVtt, toVttCharacter, VTT_MAX_IMPORT_BATCH } from "@runas/vtt-bridge"
import type { Character } from "@runas/core/types/character"

/** Mensagem para o usuário: o RunasVTT explica o motivo (ex.: nenhuma cena aberta). */
export function vttErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Detecta a ponte apenas no navegador; durante o SSR ela não existe. */
export function isRunasVttAvailable(): boolean {
  return typeof window !== "undefined" && getRunasVtt(window) !== null
}

/** O Tools servido pela Vista dos Jogadores aceita somente uma ficha por assento. */
export function isRunasVttSeat(): boolean {
  if (typeof window === "undefined") return false
  return getRunasVtt(window)?.scope === "seat"
}

/** Envia uma ficha para a cena aberta; devolve `false` fora do RunasVTT. */
export async function sendCharacterToVtt(character: Character): Promise<boolean> {
  if (typeof window === "undefined") return false
  const bridge = getRunasVtt(window)
  if (!bridge) return false
  await bridge.importCharacters([toVttCharacter(character, "tools")])
  return true
}

/** Envia várias fichas para a cena aberta; devolve `null` fora do RunasVTT. */
export async function sendCharactersToVtt(characters: Character[]): Promise<number | null> {
  if (typeof window === "undefined") return null
  const bridge = getRunasVtt(window)
  if (!bridge) return null
  let sent = 0
  for (let offset = 0; offset < characters.length; offset += VTT_MAX_IMPORT_BATCH) {
    const batch = characters.slice(offset, offset + VTT_MAX_IMPORT_BATCH).map((character) => toVttCharacter(character, "tools"))
    const { tokenIds } = await bridge.importCharacters(batch)
    sent += tokenIds.length
  }
  return sent
}
