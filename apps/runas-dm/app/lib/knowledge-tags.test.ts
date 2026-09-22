import { describe, expect, it } from "vitest"
import { createKnowledgePage, normalizeKnowledgeWorkspace } from "./knowledge-model"
import { ensureTagsForPage, pagesForTag, removeTagFromSection, renameTag, tagsForSection } from "./knowledge-tags"

describe("tags da Wiki", () => {
  it("mantém tags globais e a tag fantasma sem categoria", () => {
    const page = { ...createKnowledgePage("wiki", "characters", null), id: "p", title: "Martim", tags: ["Ruínas"] }
    const empty = { ...createKnowledgePage("wiki", "characters", null), id: "empty", title: "Sem tag" }
    let state = normalizeKnowledgeWorkspace({ pages: [page, empty] })
    state = ensureTagsForPage(state, page)
    const tags = tagsForSection(state, "characters")
    expect(tags.map((tag) => tag.name)).toEqual(["Ruínas", "Sem Categoria"])
    expect(pagesForTag(state.pages, "characters", "ruinas").map((item) => item.id)).toEqual(["p"])
    expect(pagesForTag(state.pages, "characters", "Sem Categoria").map((item) => item.id)).toEqual(["empty"])
  })

  it("renomeia globalmente e remove apenas da categoria aberta", () => {
    const state = normalizeKnowledgeWorkspace({ tags: [{ id: "tag-r", name: "Ruínas", icon: "Tag", color: "#fff", pinnedIn: ["characters", "geography"] }], pages: [
      { id: "a", scope: "wiki", kind: "characters", title: "A", tags: ["Ruínas"] },
      { id: "b", scope: "wiki", kind: "geography", title: "B", tags: ["Ruínas"] },
    ] })
    const renamed = renameTag(state, "tag-r", "Antigas ruínas")
    expect(renamed.pages.flatMap((page) => page.tags)).toEqual(["Antigas ruínas", "Antigas ruínas"])
    const removed = removeTagFromSection(renamed, "tag-r", "characters")
    expect(removed.pages.find((page) => page.id === "a")?.tags).toEqual([])
    expect(removed.pages.find((page) => page.id === "b")?.tags).toEqual(["Antigas ruínas"])
    expect(removed.tags[0].pinnedIn).toEqual(["geography"])
  })
})
