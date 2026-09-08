import { describe, expect, it, vi } from "vitest"
import { createKnowledgePage, effectivePageLinks, missionOrderLinks, normalizeKnowledgeWorkspace, sortKnowledgePages, type KnowledgePage } from "./knowledge-model"
import { fictionalYear, normalizeUniverseEras } from "./chronology"
import { buildKnowledgeGraph } from "../components/knowledge-graph"
import { bindGraphWheel } from "./graph-wheel"
import { mergeObsidianNotes, pageToMarkdown } from "./obsidian-sync"

function mission(order: string, patch: Partial<KnowledgePage> = {}): KnowledgePage {
  return { ...createKnowledgePage("campaign", "mission", "campaign"), id: order, order, createdAt: 10, ...patch }
}

describe("ordem narrativa", () => {
  it("vincula missões existentes, ramifica 3.1/3.2 e reúne ambas em 4", () => {
    const pages = [mission("1"), mission("2"), mission("3.1"), mission("3.2"), mission("4")]
    expect(missionOrderLinks(pages[0], pages)).toEqual(["2"])
    expect(missionOrderLinks(pages[1], pages)).toEqual(["1", "3.1", "3.2"])
    expect(missionOrderLinks(pages[2], pages)).toEqual(["2", "4"])
    expect(buildKnowledgeGraph(pages).edges).toHaveLength(5)
    expect(pages.every((page) => page.linkedPageIds.length === 0)).toBe(true)
  })
  it("recalcula após renumerar ou apagar, sem misturar campanhas ou notas", () => {
    const first = mission("1", { linkedPageIds: ["manual"] })
    const pages = [first, mission("2", { order: "5" }), mission("2", { id: "other", campaignId: "other" }), mission("2", { id: "note", kind: "gm-note" })]
    expect(effectivePageLinks(first, pages)).toEqual(["manual"])
    expect(missionOrderLinks(first, [first])).toEqual([])
    expect(missionOrderLinks(first, [first, mission("2", { order: "inválida" })])).toEqual([])
  })
})

describe("ordenação e cronologia", () => {
  it("alterna datas reais em ambas as direções e usa criação na ausência de data", () => {
    const pages = [mission("1", { date: "2020-01-01" }), mission("2", { date: "2026-09-07" }), mission("3", { createdAt: Date.parse("2023-01-01") })]
    expect(sortKnowledgePages(pages, "recent").map((page) => page.id)).toEqual(["2", "3", "1"])
    expect(sortKnowledgePages(pages, "oldest").map((page) => page.id)).toEqual(["1", "3", "2"])
    expect(sortKnowledgePages([mission("3.10"), mission("3.2"), mission("2")], "order").map((page) => page.id)).toEqual(["2", "3.2", "3.10"])
  })
  it("usa anos fictícios negativos e zero sem derivá-los da data de criação", () => {
    const pages = [mission("ancient", { kind: "chronology", eventYear: -4725, createdAt: 50 }), mission("zero", { kind: "chronology", eventYear: 0, createdAt: 20 }), mission("unknown", { kind: "chronology", date: "2026-09-07", createdAt: 90 })]
    expect(sortKnowledgePages(pages, "recent").map((page) => page.id)).toEqual(["zero", "ancient", "unknown"])
    expect(sortKnowledgePages(pages, "oldest").map((page) => page.id)).toEqual(["ancient", "zero", "unknown"])
    expect([null, "", "-", "2026-09-07"].map(fictionalYear)).toEqual([null, null, null, null])
    expect(fictionalYear(0)).toBe(0)
  })
  it("preserva estilo da campanha, eras e imagens, removendo cores obsoletas de missões", () => {
    const input = { campaigns: [{ id: "campaign", title: "A", backgroundColor: "#123456", buttonColor: "#234567", boxColor: "#345678", backgroundImageDataUrl: "data:image/png;base64,AA==", imageBlur: 4 }], eras: [{ id: "monges", name: "Monges", startYear: 0, endYear: 1489, calendar: "C.E." }], pages: [mission("1", { accentColor: "#ff0000", backgroundColor: "#660044", textColor: "#ffffff", backgroundImageDataUrl: "data:image/png;base64,AA==", eraId: "monges", eventYear: 0 })] }
    const normalized = normalizeKnowledgeWorkspace(input)
    expect(normalized.campaigns[0]).toMatchObject({ backgroundColor: "#123456", buttonColor: "#234567", boxColor: "#345678", imageBlur: 4 })
    expect(normalized.pages[0]).toMatchObject({ order: "1", eraId: "monges", eventYear: 0, backgroundImageDataUrl: "data:image/png;base64,AA==" })
    expect(normalized.pages[0].accentColor).toBeUndefined()
    expect(normalized.pages[0].backgroundColor).toBeUndefined()
    expect(normalized.eras?.find((era) => era.id === "monges")?.startYear).toBe(0)
    expect(normalizeUniverseEras(undefined).find((era) => era.id === "estrelas")).toMatchObject({ startYear: -6702, endYear: 0 })
  })
  it("mantém ordem, era e ano em ida e volta pelo Obsidian", () => {
    const state = normalizeKnowledgeWorkspace({ campaigns: [{ id: "campaign", title: "Campanha" }], pages: [mission("1", { title: "Missão" }), mission("zero", { scope: "wiki", campaignId: null, kind: "chronology", title: "Marco zero", order: "", eraId: "monges", eventYear: 0 })] })
    const notes = state.pages.map((page) => ({ path: page.scope === "wiki" ? "Cronologia/Marco zero.md" : "Missão.md", markdown: pageToMarkdown(page, state), createdAt: 1, modifiedAt: 30 }))
    const restored = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), notes).state
    expect(restored.pages.find((page) => page.id === "1")?.order).toBe("1")
    expect(restored.pages.find((page) => page.id === "zero")).toMatchObject({ eraId: "monges", eventYear: 0 })
  })
})

it("cancela o zoom nativo somente no gráfico e remove o listener ao sair", () => {
  const graph = new EventTarget(), outside = new EventTarget(), zoom = vi.fn()
  const unbind = bindGraphWheel(graph, zoom)
  const pinch = new Event("wheel", { cancelable: true })
  graph.dispatchEvent(pinch)
  expect(pinch.defaultPrevented).toBe(true)
  expect(zoom).toHaveBeenCalledOnce()
  const normal = new Event("wheel", { cancelable: true })
  outside.dispatchEvent(normal)
  expect(normal.defaultPrevented).toBe(false)
  unbind()
  const after = new Event("wheel", { cancelable: true })
  graph.dispatchEvent(after)
  expect(after.defaultPrevented).toBe(false)
})
