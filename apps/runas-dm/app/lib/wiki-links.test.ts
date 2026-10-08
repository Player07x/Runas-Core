import { describe, expect, it } from "vitest"
import { createKnowledgePage, normalizeKnowledgeWorkspace } from "./knowledge-model"
import { mergeObsidianNotes } from "./obsidian-sync"
import { resolveWikiPage } from "./wiki-links"

describe("destinos dos links de notas", () => {
  it("resolve os três amigos citados na nota de Martim Avarik, do vault Valknut", () => {
    const titles = ["Martim Avarik", "Nathan Ragnar", "Anabeli Marbel", "Kamasuki Jinta"]
    const notes = titles.map((title) => ({
      path: `Personagens/${title}.md`,
      markdown: `# ${title}\n\n${title === "Martim Avarik" ? "Meus amigos: [[Nathan Ragnar]], [[Anabeli Marbel]] e [[Kamasuki Jinta]]." : "Conteúdo da nota."}`,
      createdAt: 1,
      modifiedAt: 1,
    }))
    const { state } = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), notes)
    const martin = resolveWikiPage("Martim Avarik", state.pages)!
    for (const title of titles.slice(1)) {
      expect(martin.contentHtml).toContain(`data-wiki-title="${title}"`)
      expect(resolveWikiPage(title, state.pages)?.title).toBe(title)
    }
  })

  it("resolve notas de campanha e da Wiki no mesmo conjunto, sem filtrar o escopo", () => {
    const wiki = { ...createKnowledgePage("wiki", "characters", null), title: "Gae Moore" }
    const campaign = { ...createKnowledgePage("campaign", "event", "viagem"), title: "Início" }
    expect(resolveWikiPage("Gae Moore", [campaign, wiki])).toBe(wiki)
    expect(resolveWikiPage("Início", [campaign, wiki])).toBe(campaign)
  })

  it("aceita caminho, extensão, seção e nomes em NFC sem perder colchetes", () => {
    const page = { ...createKnowledgePage("wiki", "characters", null), title: "[O&C] João", obsidianPath: "Personagens/[O&C] João.md" }
    expect(resolveWikiPage("  [O&C] JOÃO  ", [page])).toBe(page)
    expect(resolveWikiPage("Personagens/[O&C] João.md#História".normalize("NFD"), [page])).toBe(page)
    expect(page.title).toBe("[O&C] João")
  })

  it("prioriza o caminho exato e reconhece o nome do arquivo quando o título difere", () => {
    const first = { ...createKnowledgePage("wiki", "characters", null), title: "Sentinela", obsidianPath: "Personagens/Sentinela.md" }
    const second = { ...createKnowledgePage("campaign", "event", "viagem"), title: "Sentinela", obsidianPath: "Campanhas/Viagem/Eventos e Missões/Encontro.md" }
    expect(resolveWikiPage("Campanhas/Viagem/Eventos e Missões/Encontro", [first, second])).toBe(second)
    expect(resolveWikiPage("Encontro", [first, second])).toBe(second)
    expect(resolveWikiPage("Outra pasta/Encontro", [first, second])).toBeUndefined()
    expect(resolveWikiPage("Não existe", [first, second])).toBeUndefined()
    expect(resolveWikiPage("", [first, second])).toBeUndefined()
  })
})
