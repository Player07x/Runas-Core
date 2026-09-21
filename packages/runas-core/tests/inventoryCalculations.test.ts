import { describe, expect, it } from "vitest"
import { createEmptyCharacter, normalizeCharacter } from "../src/lib/characterStorage"
import { calculateEquippedArmorDefense, calculateItemRealWeight } from "../src/lib/inventoryCalculations"
import { calculateItemSizeModifier } from "../src/lib/characterCalculations"
import type { CharacterInventoryItem } from "../src/types/character"

function item(id: string, rdf: number, rdm: number, equippedAsArmor = false): CharacterInventoryItem {
  return { id, usage: "equipped", name: id, type: "armor", affinity: 0, bondPoints: 0, baseWeight: 0, size: 0, mt: 0, quantity: 1, applyScaleWeight: false, damage: "", rdf, rdm, equippedAsArmor, prCurrent: null, prMaximum: null, abilityIds: [], spellIds: [], bondId: "", skillId: "", description: "" }
}

describe("armadura ativa", () => {
  it("deriva o MT de itens em centímetros pela mesma tabela de tamanho das fichas", () => {
    expect(calculateItemSizeModifier(80)).toBe(-2)
    expect(calculateItemSizeModifier(150)).toBe(0)
    expect(calculateItemSizeModifier(200)).toBe(0)
    expect(calculateItemSizeModifier(300)).toBe(1)
    expect(calculateItemSizeModifier(10)).toBe(-6)
    expect(calculateItemSizeModifier(0)).toBe(0)
  })

  it("aplica MT ao cubo no peso verdadeiro do item", () => {
    expect(calculateItemRealWeight({ baseWeight: 2, quantity: 3, applyScaleWeight: true }, "2.0x")).toBe(48)
  })

  it("usa somente o RDF e RDM do item escolhido como armadura", () => {
    expect(calculateEquippedArmorDefense([item("leve", 2, 1), item("pesada", 8, 5, true)]))
      .toEqual({ rdf: 8, rdm: 5 })
  })

  it("ignora um item marcado como armadura quando ele não está equipado", () => {
    const stored = { ...item("guardada", 9, 7, true), usage: "stored" as const }
    expect(calculateEquippedArmorDefense([stored])).toEqual({ rdf: 0, rdm: 0 })
  })

  it("migra a primeira armadura equipada de fichas antigas sem guardar as demais", () => {
    const legacy = createEmptyCharacter()
    legacy.version = 19
    legacy.inventory = [item("primeira", 4, 2), item("segunda", 7, 6)]
    const normalized = normalizeCharacter(legacy)
    expect(normalized.inventory.map(({ usage, equippedAsArmor }) => ({ usage, equippedAsArmor }))).toEqual([
      { usage: "equipped", equippedAsArmor: true },
      { usage: "equipped", equippedAsArmor: false },
    ])
    expect(normalized.stats).toMatchObject({ armorRdf: 4, armorRdm: 2 })
  })
})
