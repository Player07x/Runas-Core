import { describe, expect, it } from "vitest"
import { formatCalendarYears, LOGI_EPOCH_IN_CE, parseCalendarYear, readCalendarYear, toLogiYear } from "./chronology"

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

  it("exibe os dois calendários, mas só quando a era usa C.E.", () => {
    expect(formatCalendarYears(1200)).toBe("1.200 C.E. · -2.827 Logi")
    expect(formatCalendarYears(4027, "C.E.")).toBe("4.027 C.E. · 0 Logi")
    expect(formatCalendarYears(0, "Solaris")).toBe("0 Solaris")
    expect(formatCalendarYears(null)).toBe("Não definido")
  })
})
