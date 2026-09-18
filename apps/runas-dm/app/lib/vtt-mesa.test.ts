import { describe, expect, it } from "vitest"
import { createEmptyCharacter } from "@runas/core/lib/characterStorage"
import { createCharacterSaveFile } from "@runas/core/lib/characterSummary"
import { actorsFromVttTokens, resourceLoss } from "./vtt-mesa"

describe("actorsFromVttTokens", () => {
  it("converte somente tokens com envelope de ficha e numera cópias", () => {
    const first = createEmptyCharacter()
    first.name = "Goblin"
    const second = createEmptyCharacter()
    second.name = "Goblin"
    const tokens = [
      { id: "a", sceneId: "scene", name: "Goblin", selected: true, source: "dm" as const, envelope: createCharacterSaveFile(first), summary: { name: "Goblin", bars: [] } },
      { id: "b", sceneId: "scene", name: "Goblin", selected: false, source: "dm" as const, envelope: createCharacterSaveFile(second), summary: { name: "Goblin", bars: [] } },
      { id: "broken", sceneId: "scene", name: "Sem ficha", selected: false, source: "dm" as const, envelope: null, summary: { name: "Sem ficha", bars: [] } },
    ]
    expect(actorsFromVttTokens(tokens)).toEqual([
      expect.objectContaining({ id: "a", copyNumber: 1, sourceId: "a" }),
      expect.objectContaining({ id: "b", copyNumber: 2, sourceId: "b" }),
    ])
  })
})

describe("resourceLoss", () => {
  it("soma perdas nas três camadas sem contar recuperação", () => {
    const before = createEmptyCharacter()
    before.stats = { ...before.stats, paExtra: 4, pa: 8, pv: 20 }
    const after = createEmptyCharacter()
    after.stats = { ...after.stats, paExtra: 1, pa: 6, pv: 13 }
    expect(resourceLoss(before, after)).toBe(12)
  })
})
