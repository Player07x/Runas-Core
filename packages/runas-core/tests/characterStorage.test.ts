import { describe, expect, it } from "vitest"
import { CHARACTER_VERSION, type Character } from "../src/types/character"
import { createEmptyCharacter, normalizeAbilities, normalizeCharacter, normalizeInventory, normalizeSpells, parseCharacterFile } from "../src/lib/characterStorage"

describe("characterStorage compartilhado", () => {
  it("preserva ids e vínculos ao normalizar uma exportação do Runas Tools", () => {
    const character = createEmptyCharacter()
    character.name = "Importável"
    character.skills.push({ id: "skill-custom", name: "Lâminas", attributeKey: "dexterity", points: 10, modifier: 2, locked: false })
    character.inventory.push({ id: "weapon", usage: "equipped", name: "Espada", type: "weapon", affinity: 1, bondPoints: 4, baseWeight: 2, size: 80, mt: 99, quantity: 1, applyScaleWeight: false, damage: "2D cortante", rdf: 0, rdm: 0, equippedAsArmor: false, prCurrent: null, prMaximum: null, abilityIds: [], spellIds: [], bondId: "", skillId: "skill-custom", description: "" })

    const normalized = normalizeCharacter(character)

    expect(normalized.skills.find((skill) => skill.id === "skill-custom")?.name).toBe("Lâminas")
    expect(normalized.inventory[0]?.skillId).toBe("skill-custom")
    expect(normalized.version).toBe(CHARACTER_VERSION)
  })

  it("migra envelopes antigos e completa coleções ausentes", () => {
    const parsed = parseCharacterFile(JSON.stringify({ version: 4, character: { version: 4, name: "Legado", info: { race: "Humano" }, attributes: { physical: 8 }, stats: { pv: 12 } } }))
    expect(parsed.name).toBe("Legado")
    expect(parsed.info.race).toBe("Humano")
    expect(parsed.skills.length).toBeGreaterThan(0)
    expect(parsed.inventory).toEqual([])
  })

  it("preserva peso zero e impede item Inato armazenado", () => {
    const character = createEmptyCharacter()
    character.inventory.push({ id: "innate", usage: "stored", name: "Garras", type: "innate", affinity: 0, bondPoints: 0, baseWeight: 0, size: 0, mt: 0, quantity: 1, applyScaleWeight: false, damage: "2D cortante", rdf: 0, rdm: 0, equippedAsArmor: false, prCurrent: null, prMaximum: null, abilityIds: [], spellIds: [], bondId: "", skillId: "", description: "" })
    const normalized = normalizeCharacter(character)
    expect(normalized.inventory[0]).toMatchObject({ type: "innate", usage: "equipped", baseWeight: 0 })
  })

  it("normaliza item, habilidade e magia soltos, fora de uma ficha (importação de um único recurso)", () => {
    const [item] = normalizeInventory([{ name: "Adaga" } as never], CHARACTER_VERSION)
    const [ability] = normalizeAbilities([{ name: "Golpe Rápido", costType: "pa", costValue: 2 } as never])
    const [spell] = normalizeSpells([{ name: "Bola de Fogo", magicType: "spell", rangeType: "area" } as never])

    expect(item).toMatchObject({ name: "Adaga", type: "other", usage: "stored", quantity: 1 })
    expect(ability).toMatchObject({ name: "Golpe Rápido", costType: "pa", costValue: 2 })
    expect(spell).toMatchObject({ name: "Bola de Fogo", magicType: "spell", rangeType: "area" })
  })
})

describe("migração da versão 23", () => {
  it("converte o encantamento e a habilidade de vínculo únicos em listas", () => {
    const legacy = { ...createEmptyCharacter(), version: 22 }
    legacy.inventory = [{ id: "item-1", usage: "equipped", name: "Espada", type: "weapon", affinity: 0, bondPoints: 0, baseWeight: 1, size: 80, mt: 0, quantity: 1, applyScaleWeight: false, damage: "", rdf: 0, rdm: 0, equippedAsArmor: false, prCurrent: null, prMaximum: null, bondId: "", skillId: "", description: "", enchantmentSpellId: "spell-1", bondAbilityId: "ability-1" } as unknown as Character["inventory"][number]]
    const migrated = normalizeCharacter(legacy)
    expect(migrated.inventory[0]).toMatchObject({ spellIds: ["spell-1"], abilityIds: ["ability-1"] })
    expect(migrated.inventory[0]).not.toHaveProperty("enchantmentSpellId")
  })

  it("cria a coleção de elementos vazia em fichas anteriores", () => {
    expect(normalizeCharacter({ ...createEmptyCharacter(), version: 22, elements: undefined }).elements).toEqual([])
  })
})
