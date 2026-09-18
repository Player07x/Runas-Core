import { describe, expect, it } from "vitest"
import { createEmptyCharacter } from "@runas/core/lib/characterStorage"
import { CHARACTER_VERSION } from "@runas/core/types/character"
import { characterFromVttToken, getRunasVtt, masteryTableIdFromVttToken, toVttCharacter, VTT_BRIDGE_PROTOCOL } from "../src/index"

describe("getRunasVtt", () => {
  it("só devolve a ponte com protocolo compatível", () => {
    const bridge = {
      protocol: VTT_BRIDGE_PROTOCOL,
      importCharacters: async () => ({ tokenIds: [] }),
      getTokens: async () => [],
      onTokensChanged: () => () => undefined,
      updateTokenCharacter: async () => undefined,
      postLog: async () => undefined,
    }
    expect(getRunasVtt({ runasVTT: bridge })).toBe(bridge)
    expect(getRunasVtt({ runasVTT: { ...bridge, protocol: 99 } })).toBeNull()
    expect(getRunasVtt({ runasVTT: { protocol: VTT_BRIDGE_PROTOCOL, importCharacters: bridge.importCharacters } })).toBeNull()
    expect(getRunasVtt({})).toBeNull()
    expect(getRunasVtt(undefined)).toBeNull()
  })
})

describe("toVttCharacter / characterFromVttToken", () => {
  it("envia envelope versionado, resumo e retrato, e reconstrói a mesma ficha", () => {
    const character = createEmptyCharacter()
    character.name = "Goblin"
    character.portraitDataUrl = "data:image/jpeg;base64,AAAA"
    const item = toVttCharacter(character, "dm", { runasDm: { masteryTableId: "double" } })
    expect(item.envelope.version).toBe(CHARACTER_VERSION)
    expect(item.summary.bars.map((bar) => bar.label)).toEqual(["PV", "PA", "PE"])
    expect(item.tokenImage).toBe(character.portraitDataUrl)
    const roundTrip = characterFromVttToken({ envelope: JSON.parse(JSON.stringify(item.envelope)) })
    expect(roundTrip.name).toBe("Goblin")
    expect(masteryTableIdFromVttToken({ envelope: item.envelope }, "default")).toBe("double")
    expect(masteryTableIdFromVttToken({ envelope: { version: 1, character } }, "default")).toBe("default")
  })

  it("ignora retrato que não seja data URL de imagem", () => {
    const character = createEmptyCharacter()
    character.portraitDataUrl = "https://exemplo.com/x.png"
    expect(toVttCharacter(character, "tools").tokenImage).toBeNull()
  })
})
