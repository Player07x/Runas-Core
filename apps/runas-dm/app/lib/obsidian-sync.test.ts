import { describe, expect, it } from "vitest"
import { normalizeKnowledgeWorkspace, type KnowledgePage } from "./knowledge-model"
import { isIgnoredVaultPath, mergeObsidianNotes, normalizeObsidianBaseUrl, obsidianPathForPage, organizedObsidianPathForPage, pageObsidianFingerprint, pageToMarkdown, synchronizeWorkspaceWithVault, type VaultAdapter } from "./obsidian-sync"

describe("Obsidian export", () => {
  const state = normalizeKnowledgeWorkspace({
    campaigns: [{ id: "campaign-1", title: "A Queda de Zotera", description: "", tags: [], createdAt: 1, updatedAt: 1 }],
    categories: [{ id: "category-1", scope: "campaign", campaignId: "campaign-1", name: "Capítulo Um", parentId: null }],
    pages: [
      {
        id: "page-1",
        scope: "campaign",
        campaignId: "campaign-1",
        kind: "mission",
        title: "Portões do Norte",
        summary: "Impedir a invasão.",
        contentHtml: "<p>Defender a muralha.</p>",
        status: "Em Progresso",
        date: "2026-09-02",
        tags: ["Zotera"],
        categoryIds: ["category-1"],
        linkedPageIds: ["page-2"],
        encounterCreatures: [{ entryId: "wolf", name: "Lobo Rúnico", quantity: 3 }],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "page-2",
        scope: "wiki",
        campaignId: null,
        kind: "geography",
        title: "Zotera",
        contentHtml: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    updatedAt: 1,
  })

  it("gera caminhos relativos ao vault", () => {
    expect(obsidianPathForPage(state.pages[0], state, "Ordem x Caos")).toBe("Ordem x Caos/Portoes do Norte.md")
  })

  it("organiza páginas da wiki por seção e categoria primária", () => {
    const wiki = state.pages[1] as KnowledgePage
    const organized = {
      ...state,
      categories: [...state.categories, { id: "wiki-region", scope: "wiki" as const, campaignId: null, name: "Regiões", parentId: null }],
      pages: [{ ...wiki, categoryIds: ["wiki-region"] }],
    }
    expect(obsidianPathForPage(organized.pages[0], organized, "")).toBe("Geografia/Regiões/Zotera.md")
  })

  it("preserva metadados, vínculos e fichas do encontro no Markdown", () => {
    const markdown = pageToMarkdown(state.pages[0] as KnowledgePage, state)
    expect(markdown).toContain('status: "Em Progresso"')
    expect(markdown).toContain('categorias: ["Capítulo Um"]')
    expect(markdown).toContain("[[Zotera]]")
    expect(markdown).toContain("3× Lobo Rúnico")
  })

  it("exporta encontro como composição de fichas e notas, sem conteúdo de wiki", () => {
    const encounter = {
      ...state.pages[0],
      kind: "encounter" as const,
      title: "Emboscada da ponte",
      summary: "Atacar quando o grupo cruzar o rio.",
      contentHtml: "<p>Texto antigo que não pertence ao encontro.</p>",
    }
    const markdown = pageToMarkdown(encounter, state)
    expect(markdown).toContain("## Notas do mestre")
    expect(markdown).toContain("Atacar quando o grupo cruzar o rio.")
    expect(markdown).not.toContain("Texto antigo")
    expect(markdown).toContain("3× Lobo Rúnico")
  })

  it("importa Markdown comum do vault sem alterar o conteúdo nem o caminho", () => {
    const markdown = "# Castelo de Zotera\n\nUm arquivo antigo que precisa continuar intacto.\n\nVeja [[Portões do Norte]].\n"
    const merged = mergeObsidianNotes(state, [{ path: "Lore/Castelo de Zotera.md", markdown, createdAt: 5, modifiedAt: 10 }])
    const page = merged.state.pages.find((candidate) => candidate.title === "Castelo de Zotera")
    expect(page).toMatchObject({ scope: "wiki", kind: "chronology", obsidianPath: "Lore/Castelo de Zotera.md", obsidianSourceMarkdown: markdown })
    expect(page?.linkedPageIds).toContain("page-1")
    expect(pageToMarkdown(page!, merged.state)).toBe(markdown)
  })

  it("deduz seção e categoria pelas pastas padronizadas", () => {
    const markdown = "# Cidade do Destino\n\nUma cidade de [[Runilis]].\n"
    const merged = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [{ path: "Geografia/Assentamentos/Cidade do Destino.md", markdown, createdAt: 5, modifiedAt: 10 }])
    const page = merged.state.pages[0]
    const category = merged.state.categories.find((item) => page.categoryIds.includes(item.id))
    expect(page.kind).toBe("geography")
    expect(category?.name).toBe("Assentamentos")
  })

  it("faz a pasta canônica vencer o estado e o frontmatter antigos", () => {
    const markdown = "---\nrunas_kind: chronology\n---\n# Roberto\n\n![[Imagem Roberto.png]]\n"
    const local = normalizeKnowledgeWorkspace({
      pages: [{
        ...state.pages[1], id: "roberto", title: "Roberto", kind: "chronology",
        obsidianPath: "Personagens/Runilitas/Roberto.md", obsidianSourceMarkdown: markdown,
        updatedAt: 100,
      }],
    })
    local.pages[0].obsidianFingerprint = pageObsidianFingerprint(local.pages[0], local)
    const merged = mergeObsidianNotes(local, [{ path: "Personagens/Runilitas/Roberto.md", markdown, createdAt: 1, modifiedAt: 10 }])
    const page = merged.state.pages[0]
    const category = merged.state.categories.find((item) => page.categoryIds.includes(item.id))
    expect(page.kind).toBe("characters")
    expect(category?.name).toBe("Runilitas")
  })

  it("consolida o caminho legado de Cronologia sem duplicar a página", () => {
    const markdown = "# Primeiro Eclipse\n\nUm acontecimento global.\n"
    const local = normalizeKnowledgeWorkspace({
      pages: [
        { ...state.pages[1], id: "old", title: "Primeiro Eclipse", kind: "chronology", obsidianPath: "Cronologia Geral/Acontecimentos Globais/Primeiro Eclipse.md", updatedAt: 5 },
        { ...state.pages[1], id: "current", title: "Primeiro Eclipse", kind: "chronology", obsidianPath: "Cronologia/Acontecimentos Globais/Primeiro Eclipse.md", updatedAt: 10 },
      ],
    })
    const merged = mergeObsidianNotes(local, [{ path: "Cronologia/Acontecimentos Globais/Primeiro Eclipse.md", markdown, createdAt: 1, modifiedAt: 20 }])
    expect(merged.state.pages).toHaveLength(1)
    expect(merged.state.pages[0].obsidianPath).toBe("Cronologia/Acontecimentos Globais/Primeiro Eclipse.md")
  })

  it("ignora áreas particulares sem confundir categorias da wiki", () => {
    expect(isIgnoredVaultPath("Campanhas/Anotações/Sessão.md")).toBe(true)
    expect(isIgnoredVaultPath("Ordem x Caos/Templates/Modelo.md")).toBe(true)
    expect(isIgnoredVaultPath("Geografia/Campanhas/Cidade.md")).toBe(false)
  })

  it("limita a API do Obsidian a HTTPS no dispositivo local", () => {
    expect(normalizeObsidianBaseUrl("https://127.0.0.1:27124/")).toBe("https://127.0.0.1:27124")
    expect(normalizeObsidianBaseUrl("https://localhost:27124/vault?x=1")).toBe("https://localhost:27124")
    expect(() => normalizeObsidianBaseUrl("http://127.0.0.1:27123")).toThrow(/HTTPS/)
    expect(() => normalizeObsidianBaseUrl("https://runas-dm.pages.dev")).toThrow(/127\.0\.0\.1/)
    expect(() => normalizeObsidianBaseUrl("/api/campaign-data")).toThrow(/HTTPS local/)
  })

  it("lê antes de gravar, cria páginas na raiz e preserva colisões", async () => {
    const files = new Map<string, string>([["Portoes do Norte.md", "# Documento pessoal\n\nNão substituir sem cópia.\n"]])
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [...files.keys()].filter((path) => path.endsWith(".md")),
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 2 }),
      writeText: async (path, content) => { files.set(path, content) },
      writeBinary: async () => undefined,
    }
    const result = await synchronizeWorkspaceWithVault(state, adapter)
    expect(files.get("Portoes do Norte.md")).toBe("# Documento pessoal\n\nNão substituir sem cópia.\n")
    expect([...files.keys()]).toContain("Portoes do Norte (page-1).md")
    expect(result.state.pages.some((page) => page.title === "Documento pessoal")).toBe(true)
  })

  it("não reescreve propriedades desconhecidas de uma nota apenas importada", async () => {
    const markdown = "---\nTítulo: O Feiticeiro Implacável\nOrganizações:\n  - Exército dos Beladonas\n---\n# Roberto\n"
    const files = new Map<string, string>([["Personagens/Runilitas/Roberto.md", markdown]])
    let writes = 0
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [...files.keys()],
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 2 }),
      writeText: async (path, content) => { writes += 1; files.set(path, content) },
      writeBinary: async () => undefined,
    }
    await synchronizeWorkspaceWithVault(normalizeKnowledgeWorkspace({}), adapter)
    expect(writes).toBe(0)
    expect(files.get("Personagens/Runilitas/Roberto.md")).toBe(markdown)
  })

  it("mantém um personagem da Wiki na Wiki mesmo referenciando a campanha de origem", () => {
    const markdown = '---\nObra de Origem:\n  - "[[Lion Heart (Campanha)]]"\n---\n# Martim\n\nProtagonista da campanha.\n'
    const merged = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [{ path: "Personagens/Runilitas/Martim.md", markdown, createdAt: 1, modifiedAt: 1 }])
    const page = merged.state.pages.find((candidate) => candidate.title === "Martim")
    expect(page?.scope).toBe("wiki")
    expect(page?.kind).toBe("characters")
    expect(page?.campaignId).toBeNull()
    expect(merged.state.campaigns).toHaveLength(0)
  })

  it("reconhece uma campanha já existente com título mais longo do que o nome derivado da nota-hub", () => {
    const local = normalizeKnowledgeWorkspace({
      campaigns: [{ id: "campaign-1", title: "Lion Heart: Guerra Sangrenta", description: "", tags: [], createdAt: 1, updatedAt: 1 }],
      updatedAt: 1,
    })
    const markdown = '---\nObra de Origem:\n  - "[[Lion Heart (Campanha)]]"\n---\n# Novo Capitão\n\nUm evento.\n'
    const merged = mergeObsidianNotes(local, [{ path: "Campanhas/Eventos e Missões/Novo Capitão.md", markdown, createdAt: 1, modifiedAt: 1 }])
    expect(merged.state.campaigns).toHaveLength(1)
    const page = merged.state.pages.find((candidate) => candidate.title === "Novo Capitão")
    expect(page?.campaignId).toBe("campaign-1")
  })

  it("deriva a campanha de 'Obra de Origem' e 'Campanha' gravadas como lista pelo Obsidian", () => {
    const hub = "# Lion Heart (Campanha)\n\nHub da campanha.\n"
    const event = '---\nObra de Origem:\n  - "[[Lion Heart (Campanha)]]"\n---\n# Novo Capitão\n\nUm evento.\n'
    const session = '---\nCampanha:\n  - "[[Lion Heart (Campanha)]]"\nData: 2026-07-19\n---\n# Pacto de Ferruccio\n\nNotas da sessão.\n'
    const merged = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [
      { path: "Campanhas/Lion Heart (Campanha).md", markdown: hub, createdAt: 1, modifiedAt: 1 },
      { path: "Campanhas/Eventos e Missões/Novo Capitão.md", markdown: event, createdAt: 1, modifiedAt: 1 },
      { path: "Campanhas/Anotações/Sessões/Pacto de Ferruccio.md", markdown: session, createdAt: 1, modifiedAt: 1 },
    ])
    expect(merged.state.campaigns).toHaveLength(1)
    expect(merged.state.campaigns[0].title).toBe("Lion Heart")
    expect(merged.state.pages.every((page) => page.scope === "campaign" && page.campaignId === merged.state.campaigns[0].id)).toBe(true)
    const session_ = merged.state.pages.find((page) => page.title === "Pacto de Ferruccio")
    expect(session_?.date).toBe("2026-07-19")
  })

  it("preserva propriedades nativas desconhecidas do Obsidian ao regravar uma página editada pelo site", () => {
    const markdown = '---\nObra de Origem:\n  - "[[Lion Heart (Campanha)]]"\nArco: Volta para Lion Heart\nEtapa: 1\nPrioridade:\n  - Alta\nStatus: false\n---\n# Novo Capitão\n\nTexto original.\n'
    const merged = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [{ path: "Campanhas/Eventos e Missões/Novo Capitão.md", markdown, createdAt: 1, modifiedAt: 1 }])
    const imported = merged.state.pages[0]
    expect(imported.obsidianExtraFrontmatter).toMatchObject({ Arco: "Volta para Lion Heart", Etapa: 1, Prioridade: ["Alta"], Status: false })
    const edited = { ...imported, summary: "Resumo adicionado pelo mestre." }
    const regenerated = pageToMarkdown(edited, merged.state)
    expect(regenerated).toContain('Obra de Origem:\n  - "[[Lion Heart (Campanha)]]"')
    expect(regenerated).toContain('Arco: "Volta para Lion Heart"')
    expect(regenerated).toContain("Etapa: 1")
    expect(regenerated).toContain('Prioridade:\n  - "Alta"')
    expect(regenerated).toContain("Status: false")
  })

  it("organiza novas páginas de campanha por tipo quando o vault tem arquivos .base", async () => {
    const state_ = normalizeKnowledgeWorkspace({
      campaigns: [{ id: "campaign-1", title: "Lion Heart", description: "", tags: [], createdAt: 1, updatedAt: 1 }],
      pages: [{ id: "mission-1", scope: "campaign", campaignId: "campaign-1", kind: "mission", title: "Nova missão", contentHtml: "", createdAt: 1, updatedAt: 1 }],
      updatedAt: 1,
    })
    expect(organizedObsidianPathForPage(state_.pages[0], state_, "")).toBe("Campanhas/Eventos e Missões/Nova missao.md")
    const files = new Map<string, string>()
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [...files.keys()],
      listBaseFiles: async () => ["Bases/base_mission_events.base"],
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 2 }),
      writeText: async (path, content) => { files.set(path, content) },
      writeBinary: async () => undefined,
    }
    await synchronizeWorkspaceWithVault(state_, adapter)
    expect([...files.keys()]).toContain("Campanhas/Eventos e Missões/Nova missao.md")
  })

  it("prioriza a edição recém-salva pelo site sobre uma divergência antiga do vault", async () => {
    const local = structuredClone(state)
    const page = local.pages[0]
    page.obsidianPath = "Portoes.md"
    page.obsidianSourceMarkdown = "# Versão inicial\n"
    page.obsidianFingerprint = pageObsidianFingerprint(page, local)
    page.title = "Portões do Norte (revisado no site)"
    page.updatedAt = 100
    const files = new Map<string, string>([["Portoes.md", "# Alteração feita no Obsidian\n"]])
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => ["Portoes.md"],
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 50 }),
      writeText: async (path, content) => { files.set(path, content) },
      writeBinary: async () => undefined,
    }
    const result = await synchronizeWorkspaceWithVault(local, adapter, "", undefined, "site")
    const synced = result.state.pages.find((candidate) => candidate.id === page.id)
    expect(synced?.title).toBe("Portões do Norte (revisado no site)")
  })

  it("cria backup e cópia de conflito quando site e vault mudaram", async () => {
    const local = structuredClone(state)
    const page = local.pages[0]
    page.obsidianPath = "Portoes.md"
    page.obsidianSourceMarkdown = "# Versão inicial\n"
    page.obsidianFingerprint = pageObsidianFingerprint(page, local)
    page.contentHtml = "<p>Alteração local importante.</p>"
    page.updatedAt = 100
    const files = new Map<string, string>([["Portoes.md", "# Alteração feita no Obsidian\n"]])
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => ["Portoes.md"],
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 50 }),
      writeText: async (path, content) => { files.set(path, content) },
      writeBinary: async () => undefined,
    }
    const result = await synchronizeWorkspaceWithVault(local, adapter)
    expect(result.backups).toBe(1)
    expect([...files.keys()].some((path) => path.startsWith("Assets/Runas DM Backups/Portoes-"))).toBe(true)
    expect(result.state.pages.some((candidate) => candidate.title.includes("cópia local em conflito"))).toBe(true)
  })
})
