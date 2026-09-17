import { describe, expect, it } from "vitest"
import { createKnowledgePage, isChronologyPage, normalizeKnowledgeWorkspace, sortKnowledgePages, storyEventsOf, withRefreshedStories, withStoryEvents, type KnowledgePage, type KnowledgeWorkspaceState } from "./knowledge-model"
import { isIgnoredVaultPath, mergeObsidianNotes, obsidianPathForPage, pageToMarkdown } from "./obsidian-sync"

function page(id: string, kind: KnowledgePage["kind"], title: string, patch: Partial<KnowledgePage> = {}): KnowledgePage {
  return { ...createKnowledgePage("wiki", kind, null), id, title, createdAt: 1, updatedAt: 1, ...patch }
}

/** História com dois eventos, já com o corpo derivado da sequência. */
function storyState(): KnowledgeWorkspaceState {
  const first = page("event-1", "event", "A queda da ponte")
  const second = page("event-2", "event", "O cerco da torre", { contentHtml: "<p>A torre resiste.</p>" })
  const story = withStoryEvents(page("story-1", "story", "Guerra das Runas", { summary: "O conflito central." }), [first.id, second.id], [first, second])
  return normalizeKnowledgeWorkspace({ pages: [story, first, second], updatedAt: 1 })
}

describe("História", () => {
  it("deriva o corpo da ordem dos eventos e vincula cada um deles", () => {
    const state = storyState()
    const story = state.pages[0]
    expect(story.storyEventIds).toEqual(["event-1", "event-2"])
    expect(story.linkedPageIds).toEqual(["event-1", "event-2"])
    expect(story.contentHtml).toBe('<ul><li><a href="#wiki:A%20queda%20da%20ponte" data-wiki-title="A queda da ponte">A queda da ponte</a></li><li><a href="#wiki:O%20cerco%20da%20torre" data-wiki-title="O cerco da torre">O cerco da torre</a></li></ul>')
    expect(storyEventsOf(story, state.pages).map((event) => event.title)).toEqual(["A queda da ponte", "O cerco da torre"])
  })

  it("remove o link e a posição ao excluir um evento, e reordena sem perder os demais", () => {
    const state = storyState()
    const story = state.pages[0]
    const remaining = state.pages.filter((candidate) => candidate.id !== "event-1")
    const withoutFirst = withStoryEvents(story, story.storyEventIds.filter((id) => id !== "event-1"), remaining)
    expect(withoutFirst.storyEventIds).toEqual(["event-2"])
    expect(withoutFirst.linkedPageIds).toEqual(["event-2"])
    expect(withoutFirst.contentHtml).not.toContain("A queda da ponte")
    const inverted = withStoryEvents(story, ["event-2", "event-1"], state.pages)
    expect(inverted.contentHtml.indexOf("O cerco da torre")).toBeLessThan(inverted.contentHtml.indexOf("A queda da ponte"))
  })

  it("grava no .md apenas os tópicos com os links, sem repetir a lista em Páginas relacionadas", () => {
    const state = storyState()
    const markdown = pageToMarkdown(state.pages[0], state)
    expect(markdown).toContain('runas_story_events: ["event-1", "event-2"]')
    expect(markdown).toContain("- [[A queda da ponte]]\n- [[O cerco da torre]]")
    expect(markdown).not.toContain("## Páginas relacionadas")
    expect(markdown).not.toContain("A torre resiste")
  })

  it("guarda a história na pasta História e cada evento na subpasta dela", () => {
    const state = storyState()
    expect(obsidianPathForPage(state.pages[0], state)).toBe("História/Guerra das Runas.md")
    expect(obsidianPathForPage(state.pages[1], state)).toBe("História/Guerra das Runas/A queda da ponte.md")
    // A pasta "Histórias" do vault continua sendo conteúdo pessoal ignorado.
    expect(isIgnoredVaultPath("Histórias/Conto antigo.md")).toBe(true)
    expect(isIgnoredVaultPath("História/Guerra das Runas.md")).toBe(false)
  })

  it("mantém ordem e tipo dos eventos na ida e volta pelo Obsidian", () => {
    const state = storyState()
    const notes = state.pages.map((candidate) => ({ path: obsidianPathForPage(candidate, state), markdown: pageToMarkdown(candidate, state), createdAt: 1, modifiedAt: 30 }))
    const restored = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), notes).state
    const story = restored.pages.find((candidate) => candidate.id === "story-1")
    expect(story?.kind).toBe("story")
    expect(story?.storyEventIds).toEqual(["event-1", "event-2"])
    const event = restored.pages.find((candidate) => candidate.id === "event-1")
    expect(event?.kind).toBe("event")
    expect(event?.scope).toBe("wiki")
    // A subpasta nomeia a história, nunca uma categoria da página.
    expect(event?.categoryIds).toEqual([])
  })

  it("entra na linha do tempo da Cronologia, ordenado pelo ano fictício", () => {
    const state = storyState()
    const dated = state.pages.map((page) => page.kind === "event" ? { ...page, eraId: "monges", eventYear: page.id === "event-1" ? 1200 : 900 } : page)
    const marker = { ...page("chronology-1", "chronology", "Queda do primeiro rei"), eraId: "monges", eventYear: 1000 }
    const timeline = [...dated, marker].filter(isChronologyPage)
    expect(timeline.map((candidate) => candidate.id)).toEqual(["event-1", "event-2", "chronology-1"])
    expect(sortKnowledgePages(timeline, "oldest").map((candidate) => candidate.id)).toEqual(["event-2", "chronology-1", "event-1"])
    expect(sortKnowledgePages(timeline, "recent").map((candidate) => candidate.id)).toEqual(["event-1", "chronology-1", "event-2"])
    // A História em si não é um marco da linha do tempo; só seus acontecimentos.
    expect(isChronologyPage(state.pages[0])).toBe(false)
  })

  it("reescreve o corpo da história quando o acontecimento é renomeado por fora", () => {
    const state = storyState()
    const renamed = state.pages.map((candidate) => candidate.id === "event-1" ? { ...candidate, title: "A ponte que resistiu" } : candidate)
    const story = withRefreshedStories(renamed, "event-1").find((candidate) => candidate.id === "story-1")
    expect(story?.contentHtml).toContain("A ponte que resistiu")
    expect(story?.contentHtml).not.toContain("A queda da ponte")
    // Sem mudança de título, nada é reescrito.
    expect(withRefreshedStories(state.pages, "event-1").find((candidate) => candidate.id === "story-1")).toBe(state.pages[0])
  })

  it("adota um evento criado direto na pasta da história e descarta a posição de um evento que sumiu", () => {
    const state = storyState()
    const notes = state.pages.map((candidate) => ({ path: obsidianPathForPage(candidate, state), markdown: pageToMarkdown(candidate, state), createdAt: 1, modifiedAt: 30 }))
    const adopted = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [
      ...notes,
      { path: "História/Guerra das Runas/Z de madrugada.md", markdown: "# Z de madrugada\n\nUm evento escrito no Obsidian.\n", createdAt: 2, modifiedAt: 31 },
    ]).state
    const story = adopted.pages.find((candidate) => candidate.id === "story-1")
    expect(story?.storyEventIds).toHaveLength(3)
    expect(storyEventsOf(story as KnowledgePage, adopted.pages).map((event) => event.title)).toEqual(["A queda da ponte", "O cerco da torre", "Z de madrugada"])

    const withoutSecond = { ...state, pages: state.pages.filter((candidate) => candidate.id !== "event-2") }
    const trimmed = mergeObsidianNotes(withoutSecond, []).state.pages.find((candidate) => candidate.id === "story-1")
    expect(trimmed?.storyEventIds).toEqual(["event-1"])
    expect(trimmed?.contentHtml).not.toContain("O cerco da torre")
  })
})
