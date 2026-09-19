import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { createEmptyCharacter, createInitialState } from "./model"
import { parseRunasImport } from "./import"

describe("parseRunasImport", () => {
  it("preserva a ficha completa do envelope exportado pelo Runas Tools", () => {
    const character = createEmptyCharacter("Martim")
    character.skills.push({ id: "skill-linked", name: "Profecia", attributeKey: "knowledge", points: 4, modifier: 2, locked: false })
    character.abilities.push({ id: "ability-linked", category: "Racial", name: "Visão", description: "", permanentModifiers: "", costType: "none", costMode: "fixed", costValue: 0, costText: "" })
    character.spells.push({ id: "spell-linked", category: "Metal", name: "Presságio", description: "", costType: "none", costMode: "fixed", costValue: 0, costText: "", magicType: "spell", rangeType: "personal", rangeText: "", area: "", duration: "", castingSkill: "Profecia" })
    character.inventory.push({ id: "attack-linked", usage: "equipped", name: "Lâmina", type: "weapon", affinity: 0, bondPoints: 0, baseWeight: 1, size: 0, mt: 0, quantity: 1, applyScaleWeight: false, damage: "2D cortante", rdf: 0, rdm: 0, equippedAsArmor: false, prCurrent: null, prMaximum: null, enchantmentSpellId: "", bondId: "", bondAbilityId: "", skillId: "skill-linked", description: "" })

    const parsed = parseRunasImport({ version: 17, character })

    expect(parsed.kind).toBe("character")
    if (parsed.kind !== "character") return
    expect(parsed.character).not.toBe(character)
    expect(parsed.character.name).toBe(character.name)
    expect(parsed.character.skills.at(-1)?.id).toBe("skill-linked")
    expect(parsed.character.abilities[0]?.id).toBe("ability-linked")
    expect(parsed.character.spells[0]?.id).toBe("spell-linked")
    expect(parsed.character.inventory[0]?.skillId).toBe("skill-linked")
  })

  it("reconhece um backup completo do Runas DM", () => {
    const state = createInitialState()
    expect(parseRunasImport(state)).toEqual({ kind: "workspace", state })
  })

  it("rejeita listas textuais que não sejam uma ficha completa", () => {
    expect(() => parseRunasImport({ skills: ["Profecia"] })).toThrow("ficha Runas válida")
  })

  it("migra uma ficha antiga do Runas Tools antes de importar", () => {
    const parsed = parseRunasImport({ version: 4, character: { version: 4, name: "Ficha antiga", info: { race: "Humano" }, attributes: { physical: 8 }, stats: { pv: 12 } } })
    expect(parsed.kind).toBe("character")
    if (parsed.kind !== "character") return
    expect(parsed.character.version).toBeGreaterThan(4)
    expect(parsed.character.info.race).toBe("Humano")
    expect(parsed.character.skills.length).toBeGreaterThan(0)
  })

  it("valida uma exportação real quando RUNAS_IMPORT_FIXTURE é informado", () => {
    const fixturePath = process.env.RUNAS_IMPORT_FIXTURE
    if (!fixturePath) return

    const parsed = parseRunasImport(JSON.parse(readFileSync(fixturePath, "utf8")) as unknown)
    expect(parsed.kind).toBe("character")
    if (parsed.kind !== "character") return
    expect(parsed.character.name.trim()).toBe("Martim de Profecy")
    expect(parsed.character.skills).toHaveLength(35)
    expect(parsed.character.bonds).toHaveLength(53)
    expect(parsed.character.abilities).toHaveLength(3)
    expect(parsed.character.spells).toHaveLength(1)
    expect(parsed.character.inventory).toHaveLength(2)
  })
})
