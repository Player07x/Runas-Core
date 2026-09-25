import { describe, expect, it } from "vitest"
import { parseYamlScalar, referenceList, restoreStrippedBracket, splitTopLevel, stringList, tagList, unquote } from "./frontmatter-values"

/** O nome real de uma campanha do mestre: o `[` inicial faz parte dele. */
const CAMPAIGN = "[O&C] Lion Heart pt. II"

describe("valor de uma linha do frontmatter: um nome nunca perde colchetes", () => {
  it("mantém o texto entre aspas, inclusive quando começa com `[`", () => {
    expect(parseYamlScalar(`"${CAMPAIGN}"`)).toBe(CAMPAIGN)
    expect(parseYamlScalar(`'${CAMPAIGN}'`)).toBe(CAMPAIGN)
    expect(parseYamlScalar('"[nome]"')).toBe("[nome]")
    expect(parseYamlScalar("'[nome]'")).toBe("[nome]")
  })

  it("mantém o texto sem aspas que começa com `[` mas não é uma lista", () => {
    expect(parseYamlScalar(CAMPAIGN)).toBe(CAMPAIGN)
    expect(parseYamlScalar("[nome] resto")).toBe("[nome] resto")
    // Os colchetes do começo fecham antes do fim: não embrulham o texto inteiro.
    expect(parseYamlScalar("[a] b [c]")).toBe("[a] b [c]")
  })

  it("só vira lista quando o primeiro `[` fecha no último caractere", () => {
    expect(parseYamlScalar("[a, b, c]")).toEqual(["a", "b", "c"])
    expect(parseYamlScalar('["a", "b"]')).toEqual(["a", "b"])
    expect(parseYamlScalar("['x', \"y\"]")).toEqual(["x", "y"])
    expect(parseYamlScalar("[]")).toEqual([])
  })

  it("um item da lista pode ser um nome com colchetes e vírgula", () => {
    expect(parseYamlScalar("[runilita, [O&C] Lion Heart pt. II]")).toEqual(["runilita", CAMPAIGN])
    expect(parseYamlScalar("[[A, B] Foo, Bar]")).toEqual(["[A, B] Foo", "Bar"])
  })

  it("um `[[wikilink]]` solto continua sendo um texto, não uma lista aninhada", () => {
    expect(parseYamlScalar("[[Lion Heart (Campanha)]]")).toBe("[[Lion Heart (Campanha)]]")
  })

  it("preserva números, booleanos e apóstrofos duplicados do YAML", () => {
    expect(parseYamlScalar("12")).toBe(12)
    expect(parseYamlScalar("-4.5")).toBe(-4.5)
    expect(parseYamlScalar("true")).toBe(true)
    expect(parseYamlScalar("false")).toBe(false)
    expect(parseYamlScalar("")).toBe("")
    expect(parseYamlScalar("'It''s'")).toBe("It's")
  })
})

describe("divisão no nível zero", () => {
  it("não separa dentro de colchetes nem de aspas", () => {
    expect(splitTopLevel("a, [b, c] d, \"e, f\", 'g, h'").map(unquote)).toEqual(["a", "[b, c] d", "e, f", "g, h"])
  })

  it("um apóstrofo no meio da palavra não abre aspas", () => {
    expect(splitTopLevel("D'Água, Mog'ray").map(unquote)).toEqual(["D'Água", "Mog'ray"])
  })

  it("separa também por quebra de linha", () => {
    expect(splitTopLevel("a\nb, c")).toEqual(["a", "b", " c"])
  })

  it("um `]` sobrando não derruba a contagem", () => {
    expect(splitTopLevel("O&C] Lion Heart, x")).toEqual(["O&C] Lion Heart", " x"])
  })
})

describe("listas de textos (ids, categorias, tags)", () => {
  it("aceita array, texto único e o formato antigo `a, b`", () => {
    expect(stringList(["a", " b ", "#c", ""])).toEqual(["a", "b", "c"])
    expect(stringList("a, b")).toEqual(["a", "b"])
    expect(stringList("a\nb")).toEqual(["a", "b"])
    expect(stringList(undefined)).toEqual([])
    expect(stringList(3)).toEqual(["3"])
  })

  it("nunca mexe nos colchetes de um item", () => {
    expect(stringList(CAMPAIGN)).toEqual([CAMPAIGN])
    expect(stringList([CAMPAIGN, "Bar"])).toEqual([CAMPAIGN, "Bar"])
    expect(stringList("[nome]")).toEqual(["[nome]"])
    expect(stringList("[nome] Foo, Bar")).toEqual(["[nome] Foo", "Bar"])
  })

  it("achata listas aninhadas e ignora o que não é texto", () => {
    expect(stringList([["a", ["b"]], { x: 1 }, null, 7])).toEqual(["a", "b", "7"])
  })
})

describe("referências únicas (nome de campanha)", () => {
  it("nunca divide por vírgula: `A Queda, Parte 1` é um nome só", () => {
    expect(referenceList("A Queda, Parte 1")).toEqual(["A Queda, Parte 1"])
  })

  it("nunca remove colchetes", () => {
    expect(referenceList(CAMPAIGN)).toEqual([CAMPAIGN])
    expect(referenceList("[nome]")).toEqual(["[nome]"])
    expect(referenceList(["[[Lion Heart (Campanha)]]", CAMPAIGN])).toEqual(["[[Lion Heart (Campanha)]]", CAMPAIGN])
  })

  it("ignora vazio e tipos estranhos", () => {
    expect(referenceList("  ")).toEqual([])
    expect(referenceList(undefined)).toEqual([])
    expect(referenceList({})).toEqual([])
  })
})

describe("conserto de nomes já gravados sem o `[` inicial", () => {
  it("devolve o colchete perdido quando sobra um `]`", () => {
    expect(restoreStrippedBracket("O&C] Lion Heart pt. II")).toBe(CAMPAIGN)
    expect(restoreStrippedBracket("nome]")).toBe("[nome]")
  })

  it("não toca em nomes íntegros nem em lixo de outro tipo", () => {
    expect(restoreStrippedBracket(CAMPAIGN)).toBe(CAMPAIGN)
    expect(restoreStrippedBracket("Runilita")).toBe("Runilita")
    expect(restoreStrippedBracket("[a] b [c]")).toBe("[a] b [c]")
    expect(restoreStrippedBracket('Eventos e Missões"] Lion Heart pt. II')).toBe('Eventos e Missões"] Lion Heart pt. II')
    expect(restoreStrippedBracket("]início")).toBe("]início")
  })

  it("é aplicado às tags", () => {
    expect(tagList(["O&C] Lion Heart pt. II", "Bar"])).toEqual([CAMPAIGN, "Bar"])
    expect(tagList(CAMPAIGN)).toEqual([CAMPAIGN])
  })
})
