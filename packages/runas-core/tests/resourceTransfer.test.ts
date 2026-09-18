import { describe, expect, it } from "vitest"
import type { CharacterAbility, CharacterBond, CharacterInventoryItem, CharacterSpell } from "../src/types/character"
import { buildAbilityListFile, parseAbilityListFile } from "../src/lib/abilityTransfer"
import { buildInventoryListFile, parseInventoryListFile } from "../src/lib/inventoryTransfer"
import { buildSpellListFile, parseSpellListFile } from "../src/lib/spellTransfer"

const ability: CharacterAbility = { id: "ability-1", category: "Geral", name: "Golpe Firme", description: "Ataca com força.", permanentModifiers: "", costType: "pe", costMode: "fixed", costValue: 2, costText: "2 PE" }
const enchantment: CharacterSpell = { id: "spell-1", category: "Arcana", name: "Lâmina Rúnica", description: "", costType: "pe", costMode: "fixed", costValue: 1, costText: "1 PE", magicType: "enchantment", rangeType: "touch", rangeText: "", area: "", duration: "Cena", castingSkill: "" }
const bond: CharacterBond = { id: "bond-1", name: "Espada Antiga" } as CharacterBond
const item: CharacterInventoryItem = { id: "item-1", usage: "equipped", name: "Espada", type: "weapon", affinity: 1, bondPoints: 0, baseWeight: 2, quantity: 1, applyScaleWeight: false, damage: "1d8", rdf: 0, rdm: 0, equippedAsArmor: false, prCurrent: null, prMaximum: null, enchantmentSpellId: "spell-1", bondId: "bond-1", bondAbilityId: "ability-1", skillId: "", description: "" }

describe("listas de habilidades, magias e itens", () => {
  it("devolve as habilidades exportadas sem o id da ficha de origem", () => {
    const { id, ...withoutId } = ability
    void id
    expect(parseAbilityListFile(JSON.stringify(buildAbilityListFile([ability])))).toEqual([withoutId])
  })

  it("devolve as magias exportadas sem o id da ficha de origem", () => {
    const [spell] = parseSpellListFile(JSON.stringify(buildSpellListFile([enchantment])))
    expect(spell).not.toHaveProperty("id")
    expect(spell.name).toBe("Lâmina Rúnica")
  })

  it("embute o encantamento e troca os vínculos por nomes no inventário", () => {
    const [imported] = parseInventoryListFile(JSON.stringify(buildInventoryListFile([item], [enchantment], [bond], [ability], [])))
    expect(imported.enchantment?.name).toBe("Lâmina Rúnica")
    expect(imported.bondName).toBe("Espada Antiga")
    expect(imported.bondAbilityName).toBe("Golpe Firme")
    expect(imported).not.toHaveProperty("enchantmentSpellId")
  })

  it("recusa arquivos que não são listas do Runas Tools", () => {
    expect(() => parseAbilityListFile(JSON.stringify(buildSpellListFile([enchantment])))).toThrow("não é um arquivo de habilidades")
    expect(() => parseInventoryListFile("{")).toThrow("JSON válido")
  })
})
