import { describe, expect, it } from "vitest"
import { buildKnowledgeGraph, filterKnowledgeGraphPages } from "./knowledge-graph"
import type { KnowledgePage, KnowledgePageKind } from "../lib/knowledge-model"

function page(id: string, title: string, kind: KnowledgePageKind, linkedPageIds: string[] = [], contentHtml = ""): KnowledgePage {
  return {
    id, title, kind, linkedPageIds, contentHtml,
    scope: "wiki", campaignId: null, summary: "", status: "Sem Status", date: "", tags: [], categoryIds: [], bestiaryEntryId: null,
    encounterCreatures: [], storyEventIds: [], obsidianPath: "", obsidianExtraFrontmatter: {}, obsidianSourceMarkdown: "", obsidianFingerprint: "", obsidianModifiedAt: 0, createdAt: 1, updatedAt: 1,
  }
}

describe("buildKnowledgeGraph", () => {
  it("filtra a Wiki para as sete seções e a campanha para os registros visíveis", () => {
    const wikiEvent = page("wiki-event", "Acontecimento", "event")
    const story = page("story", "História", "story")
    const outside = { ...page("outside", "Cronos", "characters"), obsidianPath: "Sagas de Cronos/Cronos.md" }
    const note = { ...page("note", "Nota", "gm-note"), scope: "campaign" as const, campaignId: "campanha" }
    const mission = { ...page("mission", "Missão", "mission"), scope: "campaign" as const, campaignId: "campanha" }
    expect(filterKnowledgeGraphPages([wikiEvent, story, outside, note, mission], "wiki").map((item) => item.id)).toEqual(["wiki-event", "story"])
    expect(filterKnowledgeGraphPages([wikiEvent, story, outside, note, mission], "campaign").map((item) => item.id)).toEqual(["story", "mission"])
    expect(filterKnowledgeGraphPages([wikiEvent, story, outside, note, mission], "campaign").some((item) => item.kind === "gm-note")).toBe(false)
  })

  it("combina vínculos explícitos e links Wiki sem duplicar arestas", () => {
    const graph = buildKnowledgeGraph([
      page("a", "Alukah", "characters", ["b"], "<p>Encontra [[Rolven]] e [[Cidade do Lírio]].</p>"),
      page("b", "Rolven", "characters", ["a"]),
      page("c", "Cidade do Lírio", "geography"),
    ])

    expect(graph.edges).toEqual([
      { sourceId: "a", targetId: "b" },
      { sourceId: "a", targetId: "c" },
    ])
    expect(graph.nodes.find((node) => node.page.id === "a")?.degree).toBe(2)
  })

  it("produz layout determinístico e destaca hubs pelo tamanho", () => {
    const pages = [
      page("hub", "Índice", "chronology", ["a", "b", "c"]),
      page("a", "A", "characters"),
      page("b", "B", "geography"),
      page("c", "C", "items"),
    ]
    const first = buildKnowledgeGraph(pages)
    const second = buildKnowledgeGraph(pages)

    expect(first.nodes.map(({ x, y }) => [x, y])).toEqual(second.nodes.map(({ x, y }) => [x, y]))
    expect(first.nodes.find((node) => node.page.id === "hub")!.radius).toBeGreaterThan(first.nodes.find((node) => node.page.id === "a")!.radius)
    expect(new Set(first.nodes.map((node) => `${node.x.toFixed(2)},${node.y.toFixed(2)}`)).size).toBe(pages.length)
  })
})
