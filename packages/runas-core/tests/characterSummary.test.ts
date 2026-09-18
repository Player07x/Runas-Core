import { describe, expect, it } from "vitest"
import { calculateCharacterStatSnapshot } from "../src/lib/characterStatCalculations"
import { createCharacterSaveFile, summarizeCharacterResources } from "../src/lib/characterSummary"
import { createEmptyCharacter, parseCharacterFile } from "../src/lib/characterStorage"
import { CHARACTER_VERSION } from "../src/types/character"

describe("summarizeCharacterResources", () => {
  it("usa os valores atuais e os máximos calculados pela ficha", () => {
    const character = createEmptyCharacter()
    character.name = "  Goblin  "
    character.attributes = { ...character.attributes, physical: 6, vitality: 3, mystic: 4, power: 2 }
    character.stats = { ...character.stats, pv: 5, pa: 1, pe: 2 }
    const snapshot = calculateCharacterStatSnapshot(character.attributes, character.info, character.stats, character.skills, character.abilities)
    expect(summarizeCharacterResources(character)).toEqual({
      name: "Goblin",
      bars: [
        { label: "PV", value: 5, max: snapshot.pvMax },
        { label: "PA", value: 1, max: snapshot.paMax },
        { label: "PE", value: 2, max: snapshot.peMax },
      ],
    })
    expect(snapshot.pvMax).toBeGreaterThan(0)
  })

  it("dá nome padrão à ficha sem nome", () => {
    expect(summarizeCharacterResources(createEmptyCharacter()).name).toBe("Sem nome")
  })
})

describe("createCharacterSaveFile", () => {
  it("gera o envelope versionado que parseCharacterFile lê de volta", () => {
    const character = createEmptyCharacter()
    character.name = "Aria"
    const file = createCharacterSaveFile(character)
    expect(file.version).toBe(CHARACTER_VERSION)
    expect(parseCharacterFile(JSON.stringify(file)).name).toBe("Aria")
  })
})
