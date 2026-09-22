import { describe, expect, it } from "vitest"
import { eraForYear, erasForYear, formatCalendarYears, LOGI_EPOCH_IN_CE, normalizeUniverseEras, parseCalendarYear, readCalendarYear, resolveEra, toLogiYear, withEraTags } from "./chronology"

describe("calendário fictício", () => {
  it("lê o ano com ou sem calendário e guarda sempre em C.E.", () => {
    expect(parseCalendarYear("1200")).toBe(1200)
    expect(parseCalendarYear("1.200 C.E.")).toBe(1200)
    expect(parseCalendarYear("1200 c.e.")).toBe(1200)
    expect(parseCalendarYear("-4725")).toBe(-4725)
    expect(parseCalendarYear(0)).toBe(0)
  })

  it("converte Logi para C.E. pela origem documentada (4.027 C.E. = 0 Logi)", () => {
    expect(parseCalendarYear("0 Logi")).toBe(LOGI_EPOCH_IN_CE)
    expect(parseCalendarYear("0 logi")).toBe(4027)
    expect(parseCalendarYear("10 Logi")).toBe(4037)
    expect(parseCalendarYear("-27 logi")).toBe(4000)
    expect(toLogiYear(4027)).toBe(0)
    expect(toLogiYear(1200)).toBe(-2827)
    expect(readCalendarYear("0 Logi")).toEqual({ year: 0, calendar: "logi" })
    expect(readCalendarYear("1200")).toEqual({ year: 1200, calendar: "ce" })
  })

  it("recusa texto que não é um ano inteiro", () => {
    expect(parseCalendarYear("")).toBeNull()
    expect(parseCalendarYear("C.E.")).toBeNull()
    expect(parseCalendarYear("Logi")).toBeNull()
    expect(parseCalendarYear("2026-09-07")).toBeNull()
    expect(parseCalendarYear("mil e duzentos")).toBeNull()
    expect(parseCalendarYear(1.5)).toBeNull()
  })

  it("deduz a era pelo ano, preferindo o intervalo mais específico", () => {
    const eras = normalizeUniverseEras(undefined)
    expect(eraForYear(1200, eras)?.id).toBe("monges")
    expect(eraForYear(4500, eras)?.id).toBe("cacadores")
    expect(eraForYear(-6000, eras)?.id).toBe("estrelas")
    expect(eraForYear(-20000, eras)?.id).toBe("titas")
    // O ano 0 encerra a Era das Estrelas e abre a dos Monges: vence quem começa nele.
    expect(eraForYear(0, eras)?.id).toBe("monges")
    // Entre 1.489 e 4.027 o documento não define limites; nada é deduzido.
    expect(eraForYear(2000, eras)).toBeUndefined()
    expect(eraForYear(null, eras)).toBeUndefined()
  })

  it("mantém a era gravada quando o ano não classifica sozinho", () => {
    const eras = normalizeUniverseEras(undefined)
    expect(resolveEra(2000, eras, "magos")?.id).toBe("magos")
    expect(resolveEra(null, eras, "magos")?.id).toBe("magos")
    // Um ano que classifica vence a era antiga gravada no registro.
    expect(resolveEra(1200, eras, "magos")?.id).toBe("monges")
    expect(resolveEra(null, eras, "")).toBeUndefined()
  })

  it("exibe os dois calendários, mas só quando a era usa C.E.", () => {
    expect(formatCalendarYears(1200)).toBe("1.200 C.E. · -2.827 Logi")
    expect(formatCalendarYears(4027, "C.E.")).toBe("4.027 C.E. · 0 Logi")
    expect(formatCalendarYears(0, "Solaris")).toBe("0 Solaris")
    expect(formatCalendarYears(null)).toBe("Não definido")
  })

  it("marca todas as eras sobrepostas e recalcula de forma idempotente", () => {
    const eras = [
      { id: "a", title: "Era A", eraStartYear: 0, eraEndYear: 100 },
      { id: "b", title: "Era B", eraStartYear: 50, eraEndYear: 150 },
      { id: "open", title: "Sem limites", eraStartYear: null, eraEndYear: null },
    ]
    expect(erasForYear(75, eras).map((era) => era.id)).toEqual(["a", "b"])
    const pages = [{ id: "event", scope: "wiki", kind: "event", eventYear: 75, tags: ["Era A", "livro"] }, { id: "none", scope: "wiki", kind: "event", eventYear: 500, tags: ["Era A"] }]
    const tagged = withEraTags(pages, eras)
    expect(tagged[0].tags).toEqual(["livro", "Era A", "Era B"])
    expect(tagged[1].tags).toEqual([])
    expect(withEraTags(tagged, eras)).toEqual(tagged)
  })
})
