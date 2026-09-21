import { describe, expect, it } from "vitest"
import { availableElementFusions, calculateElementTest, fusionRecipes, selectableElements } from "../src/lib/elementSkills"
import { findCharacterTestSource, listCharacterTestSources } from "../src/lib/characterTestSources"
import { characterElements } from "../src/data/elements"
import { createEmptyCharacter, normalizeCharacter } from "../src/lib/characterStorage"
import type { CharacterElementSkill } from "../src/types/character"

const element = (id: string, level: number): CharacterElementSkill => ({ id: `e-${id}`, elementId: id, name: id, level })

describe("elementos como perícia curta", () => {
  it("oferece só os elementos básicos, raros e divinos", () => {
    expect(selectableElements.map((entry) => entry.id)).toEqual(["fogo", "terra", "agua", "vento", "luz", "sombra", "estelar", "abissal"])
    expect(selectableElements.some((entry) => entry.kind === "Fusão" || entry.kind === "Especial")).toBe(false)
  })

  it("calcula o teste como Místico + Poder + nível", () => {
    expect(calculateElementTest({ ...createEmptyCharacter().attributes, mystic: 7, power: 3 }, 2)).toBe(12)
  })

  it("lê as receitas das fusões, inclusive as alternativas entre parênteses", () => {
    const metal = characterElements.find((entry) => entry.id === "metal")!
    expect(fusionRecipes(metal)).toEqual([["Fogo", "Terra"]])
    const magma = characterElements.find((entry) => entry.id === "magma")!
    expect(fusionRecipes(magma)).toEqual([["Fogo", "Terra", "Água"]])
    const vazio = characterElements.find((entry) => entry.id === "vazio")!
    expect(fusionRecipes(vazio)).toEqual([["Luz", "Sombra"], ["Estelar", "Abissal"]])
  })
})

describe("fusões disponíveis", () => {
  it("aparecem sozinhas quando os componentes têm nível maior que zero, com o nível somado", () => {
    const fusions = availableElementFusions([element("fogo", 2), element("terra", 3)])
    expect(fusions.map((fusion) => [fusion.element.name, fusion.level])).toEqual([["Metal", 5]])
  })

  it("ignora componentes de nível zero", () => {
    expect(availableElementFusions([element("fogo", 2), element("terra", 0)])).toEqual([])
  })

  it("acumula fusões de dois e de três elementos", () => {
    const fusions = availableElementFusions([element("fogo", 1), element("terra", 1), element("agua", 1)])
    expect(fusions.map((fusion) => `${fusion.element.name} ${fusion.level}`).sort())
      .toEqual(["Magma 3", "Metal 2", "Planta 2", "Vapor 2"])
  })

  it("escolhe a receita de maior nível quando duas servem", () => {
    const fusions = availableElementFusions([element("luz", 1), element("sombra", 1), element("estelar", 4), element("abissal", 4)])
    expect(fusions.find((fusion) => fusion.element.id === "vazio")).toMatchObject({ level: 8, components: ["Estelar", "Abissal"] })
  })
})

describe("elemento onde a ficha pede uma perícia", () => {
  it("lista perícias, elementos e fusões com o mesmo formato", () => {
    const character = normalizeCharacter({ ...createEmptyCharacter(), attributes: { ...createEmptyCharacter().attributes, mystic: 7, power: 2 }, elements: [element("fogo", 2), element("terra", 1)] })
    const sources = listCharacterTestSources(character)
    expect(sources.find((source) => source.name === "Fogo")).toMatchObject({ kind: "element", test: 11 })
    expect(sources.find((source) => source.name === "Metal")).toMatchObject({ kind: "fusion", test: 12 })
    expect(sources.some((source) => source.kind === "skill")).toBe(true)
  })

  it("resolve por id e por nome, como o campo de conjuração guarda", () => {
    const character = normalizeCharacter({ ...createEmptyCharacter(), elements: [element("fogo", 2)] })
    expect(findCharacterTestSource(character, "e-fogo")?.name).toBe("Fogo")
    expect(findCharacterTestSource(character, "fogo")?.kind).toBe("element")
    expect(findCharacterTestSource(character, "inexistente")).toBeUndefined()
  })
})

describe("normalização dos elementos", () => {
  it("usa o nome do livro quando há elementId e descarta entradas sem nome", () => {
    const character = normalizeCharacter({ elements: [{ id: "a", elementId: "fogo", name: "escrito errado", level: 3 }, { id: "b", elementId: "", name: "  ", level: 1 }] as CharacterElementSkill[] })
    expect(character.elements).toEqual([{ id: "a", elementId: "fogo", name: "Fogo", level: 3 }])
  })

  it("aceita um elemento digitado à mão e nunca deixa o nível negativo", () => {
    const character = normalizeCharacter({ elements: [{ id: "a", elementId: "", name: "Cronos", level: -4 }] as CharacterElementSkill[] })
    expect(character.elements).toEqual([{ id: "a", elementId: "", name: "Cronos", level: 0 }])
  })
})
