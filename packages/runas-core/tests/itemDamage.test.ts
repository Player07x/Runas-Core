import { describe, expect, it } from "vitest"
import { calculateItemDamageBonus, calculateMtDifferenceDamageBonus, composeItemDamageExpression } from "../src/lib/itemDamage"

const item = (patch: Partial<{ affinity: 0 | 1 | 2 | 3 | 4; bondPoints: number; mt: number; applyScaleWeight: boolean }> = {}) => ({
  affinity: 0 as const, bondPoints: 0, mt: 0, applyScaleWeight: false, ...patch,
})

describe("bônus de dano do item", () => {
  it("ignora a afinidade: ela descreve o item, não o dano", () => {
    expect(calculateItemDamageBonus(item({ affinity: 0 })).total).toBe(0)
    expect(calculateItemDamageBonus(item({ affinity: 2 })).total).toBe(0)
    expect(calculateItemDamageBonus(item({ affinity: 4 })).total).toBe(0)
  })

  it("soma +1 por nível de vínculo, pelos pontos de vínculo do item", () => {
    expect(calculateItemDamageBonus(item({ bondPoints: 9 })).bond).toBe(0)
    expect(calculateItemDamageBonus(item({ bondPoints: 10 })).bond).toBe(1)
    expect(calculateItemDamageBonus(item({ bondPoints: 20 })).bond).toBe(2)
    expect(calculateItemDamageBonus(item({ bondPoints: 160 })).bond).toBe(5)
  })

  it("converte a diferença de MT: -1 por ponto abaixo, +2 por ponto acima", () => {
    expect(calculateMtDifferenceDamageBonus(-2, 0)).toBe(-2)
    expect(calculateMtDifferenceDamageBonus(3, 0)).toBe(6)
    expect(calculateMtDifferenceDamageBonus(1, 3)).toBe(-2)
  })

  /** MT 0 no item também significa "tamanho não informado": nunca penaliza. */
  it("trata o MT 0 do item como neutro, qualquer que seja o MT do personagem", () => {
    expect(calculateMtDifferenceDamageBonus(0, 0)).toBe(0)
    expect(calculateMtDifferenceDamageBonus(0, 1)).toBe(0)
    expect(calculateMtDifferenceDamageBonus(0, -2)).toBe(0)
    expect(calculateItemDamageBonus(item({ mt: 0, applyScaleWeight: true }), "+1").total).toBe(0)
  })

  it("só aplica o MT com `Usar MT?` ativo", () => {
    expect(calculateItemDamageBonus(item({ mt: 2, applyScaleWeight: false }), 0).mt).toBe(0)
    expect(calculateItemDamageBonus(item({ mt: 2, applyScaleWeight: true }), 0).mt).toBe(4)
    expect(calculateItemDamageBonus(item({ mt: 2, applyScaleWeight: true }), "+1").mt).toBe(2)
  })

  it("acumula vínculo e MT no total, sem a afinidade", () => {
    const bonus = calculateItemDamageBonus(item({ affinity: 2, bondPoints: 40, mt: 1, applyScaleWeight: true }), "-1")
    expect(bonus).toEqual({ bond: 3, mt: 4, total: 7 })
  })
})

describe("expressão de dano com o bônus", () => {
  it("soma o bônus ao bônus já escrito, preservando tipo e atributo", () => {
    expect(composeItemDamageExpression("2D+2 cortante (+poder)", 10)).toBe("2D+12 cortante (+poder)")
  })

  it("cria o bônus quando a expressão não tem nenhum", () => {
    expect(composeItemDamageExpression("3D queimadura", 5)).toBe("3D+5 queimadura")
  })

  it("respeita um bônus negativo já escrito e o resultado zerado", () => {
    expect(composeItemDamageExpression("3D-1 cortante", 5)).toBe("3D+4 cortante")
    expect(composeItemDamageExpression("3D+2 cortante", -2)).toBe("3D cortante")
    expect(composeItemDamageExpression("3D cortante", -3)).toBe("3D-3 cortante")
  })

  it("soma a um dano fixo, sem dados", () => {
    expect(composeItemDamageExpression("20 queimadura", 5)).toBe("25 queimadura")
  })

  it("aplica o bônus só ao primeiro dano de uma sequência", () => {
    expect(composeItemDamageExpression("2D+2 cortante e 1D queimadura", 3)).toBe("2D+5 cortante e 1D queimadura")
  })

  it("devolve a entrada intacta quando não há bônus ou não há valor para somar", () => {
    expect(composeItemDamageExpression("2D+2 cortante", 0)).toBe("2D+2 cortante")
    expect(composeItemDamageExpression("", 4)).toBe("")
    expect(composeItemDamageExpression("cortante", 4)).toBe("cortante")
  })
})
