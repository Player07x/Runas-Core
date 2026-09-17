import { describe, expect, it } from "vitest"
import { buildKnowledgeGraph } from "./knowledge-graph"
import type { KnowledgePage, KnowledgePageKind } from "../lib/knowledge-model"

function page(id: string, title: string, kind: KnowledgePageKind, linkedPageIds: string[] = [], contentHtml = ""): KnowledgePage {
  return {
    id, title, kind, linkedPageIds, contentHtml,
    scope: "wiki", campaignId: null, summary: "", status: "Sem Status", date: "", tags: [], categoryIds: [], bestiaryEntryId: null,
    encounterCreatures: [], storyEventIds: [], obsidianPath: "", obsidianExtraFrontmatter: {}, obsidianSourceMarkdown: "", obsidianFingerprint: "", obsidianModifiedAt: 0, createdAt: 1, updatedAt: 1,
  }
}

describe("buildKnowledgeGraph", () => {
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
