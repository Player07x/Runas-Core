import { describe, expect, it } from "vitest"
import { applyCloudBackup, normalizeKnowledgeWorkspace, type KnowledgePage } from "./knowledge-model"
import { dataUrlToBlob, deleteCampaignHubNotes, deleteVaultNote, isIgnoredVaultPath, isSynchronizableRootFolder, bodyStartsWithSummary, buildKnowledgeZipFiles, markdownToHtml, mergeObsidianNotes, noteFileName, pagesOutsideAllowedFolders, removePagesOutsideAllowedFolders, obsidianPathForPage, organizedObsidianPathForPage, pageObsidianFingerprint, pageToMarkdown, synchronizeWorkspaceWithVault, type VaultAdapter } from "./obsidian-sync"

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

  it("gera caminhos relativos ao vault, sempre dentro da pasta da campanha", () => {
    // A exportação nunca grava página de campanha na raiz do vault (plano v3, §5.1.4).
    expect(obsidianPathForPage(state.pages[0], state, "Ordem x Caos")).toBe("Ordem x Caos/Campanhas/A Queda de Zotera/Eventos e Missões/Portões do Norte.md")
    expect(obsidianPathForPage(state.pages[0], state, "")).toBe("Campanhas/A Queda de Zotera/Eventos e Missões/Portões do Norte.md")
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
    // A categoria virou tag na v3: `categorias:` ainda é lido, mas nunca escrito.
    expect(markdown).toContain('tags: ["Zotera", "Capítulo Um"]')
    expect(markdown).not.toContain("categorias:")
    expect(markdown).toContain("[[Zotera]]")
    expect(markdown).toContain("3× Lobo Rúnico")
  })

  it("nunca grava o Estilo da campanha no Markdown: é uma personalização exclusiva do site", () => {
    const styled = {
      ...state,
      campaigns: [{ ...state.campaigns[0], accentColor: "#9987a3", backgroundColor: "#100d0e", boxColor: "#1b1517", buttonColor: "#35242b", textColor: "#f5eeee", imageBlur: 12, backgroundImageDataUrl: "data:image/png;base64,zzzz" }],
    }
    const markdown = pageToMarkdown(styled.pages[0] as KnowledgePage, styled)
    for (const forbidden of ["#9987a3", "#100d0e", "#1b1517", "#35242b", "#f5eeee", "accentColor", "backgroundColor", "boxColor", "buttonColor", "textColor", "imageBlur", "backgroundImageDataUrl", "data:image/png;base64,zzzz"]) {
      expect(markdown).not.toContain(forbidden)
    }
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

  it("importa Markdown comum de uma pasta permitida sem alterar o conteúdo nem o caminho", () => {
    const markdown = "# Castelo de Zotera\n\nUm arquivo antigo que precisa continuar intacto.\n\nVeja [[Portões do Norte]].\n"
    const merged = mergeObsidianNotes(state, [{ path: "Geografia/Castelo de Zotera.md", markdown, createdAt: 5, modifiedAt: 10 }])
    const page = merged.state.pages.find((candidate) => candidate.title === "Castelo de Zotera")
    expect(page).toMatchObject({ scope: "wiki", kind: "geography", obsidianPath: "Geografia/Castelo de Zotera.md", obsidianSourceMarkdown: markdown })
    expect(page?.linkedPageIds).toContain("page-1")
    expect(pageToMarkdown(page!, merged.state)).toBe(markdown)
  })

  /** Lista de permissão do plano v3 (§5.1): fora das sete categorias e de `Campanhas`, nada entra. */
  it("não importa nota de pasta desconhecida nem arquivo solto na raiz, mesmo com runas_id", () => {
    const comId = '---\nrunas: true\nrunas_id: "page-1"\n---\n# Contaminada\n\nVeio de outro universo.\n'
    const merged = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [
      { path: "Sagas de Cronos/Heroi.md", markdown: "# Heroi\n", createdAt: 1, modifiedAt: 1 },
      { path: "Nota solta.md", markdown: "# Nota solta\n", createdAt: 1, modifiedAt: 1 },
      { path: "Runas-Book/Personagens/Martim.md", markdown: comId, createdAt: 1, modifiedAt: 1 },
    ])
    expect(merged.state.pages).toHaveLength(0)
    expect(merged.imported).toBe(0)
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

  it("nunca importa a nota-vitrine de um catálogo Bases, e remove uma versão antiga já importada", () => {
    const markdown = "# Catálogo de Personagens\n\n![[base_characters.base]]\n"
    const local = normalizeKnowledgeWorkspace({
      pages: [{ ...state.pages[1], id: "old-catalog", title: "Catálogo de Personagens", kind: "characters", obsidianPath: "Personagens/Catálogo de Personagens.md" }],
    })
    const merged = mergeObsidianNotes(local, [{ path: "Personagens/Catálogo de Personagens.md", markdown, createdAt: 1, modifiedAt: 10 }])
    expect(merged.state.pages.find((page) => page.obsidianPath === "Personagens/Catálogo de Personagens.md")).toBeUndefined()
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
    // `Campanhas` saiu da exclusão na v3: é a pasta raiz oficial das campanhas.
    expect(isIgnoredVaultPath("Campanhas/Anotações/Sessão.md")).toBe(false)
    expect(isIgnoredVaultPath("Ordem x Caos/Templates/Modelo.md")).toBe(true)
    expect(isIgnoredVaultPath("Geografia/Campanhas/Cidade.md")).toBe(false)
  })

  it("só reconhece uma pasta de seção quando ela está na raiz do vault", () => {
    // Runas-Book é outro app que pode compartilhar o mesmo vault; uma pasta
    // "Personagens" dentro dele não é a pasta raiz "Personagens" da Wiki.
    expect(isIgnoredVaultPath("Runas-Book/Personagens/Martim.md")).toBe(true)
    const markdown = "# Martim\n\nPersonagem de outro app, fora da raiz do vault.\n"
    const merged = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [{ path: "Outra Pasta/Personagens/Martim.md", markdown, createdAt: 1, modifiedAt: 1 }])
    expect(merged.state.pages.find((page) => page.title === "Martim")?.kind).not.toBe("characters")
  })

  it("decodifica uma data URL em vez de depender de fetch, que o CSP bloqueia para o esquema data:", () => {
    const blob = dataUrlToBlob("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
    expect(blob.type).toBe("image/png")
    expect(blob.size).toBeGreaterThan(0)
  })

  it("nunca grava na raiz do vault e deixa intacta a nota solta que já estava lá", async () => {
    const files = new Map<string, string>([["Portoes do Norte.md", "# Documento pessoal\n\nNão substituir sem cópia.\n"]])
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [...files.keys()].filter((path) => path.endsWith(".md")),
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 2 }),
      writeText: async (path, content) => { files.set(path, content) },
      writeBinary: async () => undefined,
    }
    const result = await synchronizeWorkspaceWithVault(state, adapter)
    // A nota solta na raiz não é do Runas DM: continua intacta e não vira página.
    expect(files.get("Portoes do Norte.md")).toBe("# Documento pessoal\n\nNão substituir sem cópia.\n")
    expect(result.state.pages.some((page) => page.title === "Documento pessoal")).toBe(false)
    // E a página de campanha vai para a pasta da campanha, nunca para a raiz.
    expect([...files.keys()]).toContain("Campanhas/A Queda de Zotera/Eventos e Missões/Portões do Norte.md")
  })

  it("apaga a nota do vault ao excluir a página, deixando uma cópia de segurança", async () => {
    const markdown = "# Encontro na Ponte\n\nDetalhes do encontro.\n"
    const files = new Map<string, string>([["Campanhas/Lion Heart/Encontros/Encontro na Ponte.md", markdown]])
    const deleted: string[] = []
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [...files.keys()],
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 2 }),
      writeText: async (path, content) => { files.set(path, content) },
      writeBinary: async () => undefined,
      deleteFile: async (path) => { deleted.push(path); files.delete(path) },
    }
    const page = { ...state.pages[0], obsidianPath: "Campanhas/Lion Heart/Encontros/Encontro na Ponte.md", obsidianSourceMarkdown: markdown }
    await deleteVaultNote(page, adapter, "")
    expect(deleted).toEqual(["Campanhas/Lion Heart/Encontros/Encontro na Ponte.md"])
    expect(files.has("Campanhas/Lion Heart/Encontros/Encontro na Ponte.md")).toBe(false)
    const backupEntry = [...files.entries()].find(([path]) => path.startsWith("Assets/Runas DM Backups/"))
    expect(backupEntry?.[1]).toBe(markdown)
  })

  it("não faz nada ao excluir uma página que nunca existiu no vault", async () => {
    let deleteCalls = 0
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [],
      readNote: async (path) => ({ path, markdown: "", createdAt: 1, modifiedAt: 1 }),
      writeText: async () => undefined,
      writeBinary: async () => undefined,
      deleteFile: async () => { deleteCalls += 1 },
    }
    await deleteVaultNote(state.pages[1], adapter, "")
    expect(deleteCalls).toBe(0)
  })

  it("apaga a nota-hub da campanha mesmo sem estar vinculada a nenhuma página rastreada", async () => {
    // "Lion Heart (Campanha).md" nunca precisa ter virado uma KnowledgePage
    // para, sozinha, fazer ensureCampaign recriar "Lion Heart: Guerra
    // Sangrenta" na sincronização seguinte -- seu título já basta.
    const hub = "---\ntags:\n  - campanha\n---\n![[Logo.png]]\nHub da campanha.\n"
    const outraCampanha = "# [O&C] A Cidade Alta (Campanha)\n\nOutra campanha, não deve ser tocada.\n"
    const files = new Map<string, string>([
      ["Campanhas/Lion Heart (Campanha).md", hub],
      ["Campanhas/[O&C] A Cidade Alta (Campanha).md", outraCampanha],
    ])
    const deleted: string[] = []
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [...files.keys()],
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 2 }),
      writeText: async (path, content) => { files.set(path, content) },
      writeBinary: async () => undefined,
      deleteFile: async (path) => { deleted.push(path); files.delete(path) },
    }
    const removedCount = await deleteCampaignHubNotes("Lion Heart: Guerra Sangrenta", adapter, "")
    expect(removedCount).toBe(1)
    expect(deleted).toEqual(["Campanhas/Lion Heart (Campanha).md"])
    expect(files.has("Campanhas/[O&C] A Cidade Alta (Campanha).md")).toBe(true)
    const backupEntry = [...files.entries()].find(([path]) => path.startsWith("Assets/Runas DM Backups/"))
    expect(backupEntry?.[1]).toBe(hub)
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

  it("usa o nome do arquivo como título quando a nota não começa com um cabeçalho, mesmo tendo seções internas", () => {
    // Notas longas de personagem costumam começar com um retrato (![[...]])
    // e só têm cabeçalhos `#` a partir das seções internas (Personalidade,
    // História). Duas fichas assim, com a mesma primeira seção interna, não
    // podem colidir num único título "Personalidade".
    const martim = "---\n---\n![[Foto Martim.png]]\nTexto de abertura.\n\n# Personalidade\n\nMartim é gentil.\n"
    const ferruccio = "---\n---\n![[Imagem Ferruccio.png]]\nOutro texto de abertura.\n\n# Personalidade\n\nFerruccio é frio.\n"
    const merged = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [
      { path: "Personagens/Runilitas/Martim.md", markdown: martim, createdAt: 1, modifiedAt: 1 },
      { path: "Personagens/Runilitas/Ferruccio Terano Ford.md", markdown: ferruccio, createdAt: 1, modifiedAt: 1 },
    ])
    expect(merged.state.pages).toHaveLength(2)
    expect(merged.state.pages.map((page) => page.title).sort()).toEqual(["Ferruccio Terano Ford", "Martim"])
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
    // A nota-hub em si nunca vira página: só "Novo Capitão" e "Pacto de
    // Ferruccio" devem estar rastreados.
    expect(merged.state.pages).toHaveLength(2)
    expect(merged.state.pages.every((page) => page.scope === "campaign" && page.campaignId === merged.state.campaigns[0].id)).toBe(true)
    const session_ = merged.state.pages.find((page) => page.title === "Pacto de Ferruccio")
    expect(session_?.date).toBe("2026-07-19")
  })

  it("nunca rastreia a nota-hub como página e limpa quem já foi rastreado assim antes desta correção", () => {
    // Cenário real relatado: "Lion Heart (Campanha).md" tinha virado uma
    // KnowledgePage (de uma sincronização anterior). Mesmo com o arquivo já
    // apagado direto pelo Obsidian, sem lápide a página sobreviveria intacta
    // no estado e a exportação a recriaria no disco para sempre.
    const local = normalizeKnowledgeWorkspace({
      campaigns: [{ id: "campaign-1", title: "Lion Heart", description: "", tags: [], createdAt: 1, updatedAt: 1 }],
      pages: [{
        id: "hub-page", scope: "campaign", campaignId: "campaign-1", kind: "gm-note",
        title: "Lion Heart (Campanha)", contentHtml: "", obsidianPath: "Campanhas/Lion Heart (Campanha).md",
        obsidianSourceMarkdown: "# Lion Heart (Campanha)\n\nHub da campanha.\n",
        createdAt: 1, updatedAt: 1,
      }],
      updatedAt: 1,
    })
    // O arquivo já não existe mais no vault (apagado direto pelo Obsidian).
    const merged = mergeObsidianNotes(local, [])
    expect(merged.state.pages.find((page) => page.id === "hub-page")).toBeUndefined()
    expect(merged.state.deletedIds).toContain("hub-page")
    expect(merged.state.campaigns).toHaveLength(1)
  })

  it("não reexporta a nota-hub depois de apagada direto pelo Obsidian", async () => {
    const local = normalizeKnowledgeWorkspace({
      campaigns: [{ id: "campaign-1", title: "Lion Heart", description: "", tags: [], createdAt: 1, updatedAt: 1 }],
      pages: [{
        id: "hub-page", scope: "campaign", campaignId: "campaign-1", kind: "gm-note",
        title: "Lion Heart (Campanha)", contentHtml: "", obsidianPath: "Campanhas/Lion Heart (Campanha).md",
        obsidianSourceMarkdown: "# Lion Heart (Campanha)\n\nHub da campanha.\n",
        createdAt: 1, updatedAt: 1,
      }],
      updatedAt: 1,
    })
    const files = new Map<string, string>()
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [...files.keys()],
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 2 }),
      writeText: async (path, content) => { files.set(path, content) },
      writeBinary: async () => undefined,
    }
    const result = await synchronizeWorkspaceWithVault(local, adapter)
    expect(files.has("Campanhas/Lion Heart (Campanha).md")).toBe(false)
    expect(result.state.pages.find((page) => page.id === "hub-page")).toBeUndefined()
  })

  it("não transforma a subpasta com o nome da campanha em categoria da página", () => {
    const local = normalizeKnowledgeWorkspace({
      campaigns: [{ id: "campaign-1", title: "Lion Heart: Guerra Sangrenta", description: "", tags: [], createdAt: 1, updatedAt: 1 }],
      updatedAt: 1,
    })
    const markdown = '---\ncampanha: "Lion Heart: Guerra Sangrenta"\nrunas_campaign_id: "campaign-1"\n---\n# Emboscada\n\nUm evento.\n'
    const merged = mergeObsidianNotes(local, [{ path: "Campanhas/Lion Heart Guerra Sangrenta/Eventos e Missões/Emboscada.md", markdown, createdAt: 1, modifiedAt: 1 }])
    const page = merged.state.pages.find((candidate) => candidate.title === "Emboscada")
    const categoryNames = merged.state.categories.filter((category) => page?.categoryIds.includes(category.id)).map((category) => category.name)
    expect(categoryNames).not.toContain("Lion Heart Guerra Sangrenta")
    expect(categoryNames).toContain("Eventos e Missões")
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
    expect(organizedObsidianPathForPage(state_.pages[0], state_, "")).toBe("Campanhas/Lion Heart/Eventos e Missões/Nova missão.md")
    const files = new Map<string, string>()
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [...files.keys()],
      listBaseFiles: async () => ["Bases/base_mission_events.base"],
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 2 }),
      writeText: async (path, content) => { files.set(path, content) },
      writeBinary: async () => undefined,
    }
    await synchronizeWorkspaceWithVault(state_, adapter)
    expect([...files.keys()]).toContain("Campanhas/Lion Heart/Eventos e Missões/Nova missão.md")
  })

  it("reorganiza retroativamente uma página de campanha gravada pelo Runas DM antes de o vault ter .base", async () => {
    const legacyMarkdown = '---\nrunas: true\nrunas_id: "page-legacy-1"\nrunas_scope: "campaign"\nrunas_kind: "mission"\nrunas_title: "Novo Capitão"\nrunas_summary: ""\nrunas_created_at: 1\nrunas_updated_at: 1\ntipo: "Missão"\nstatus: "Não Iniciada"\ncampanha: "Lion Heart: Guerra Sangrenta"\nrunas_campaign_id: "campaign-1"\ntags: []\ncategorias: []\nrunas_linked_ids: []\n---\n\n# Novo Capitão\n\nConteúdo.\n'
    const local = normalizeKnowledgeWorkspace({
      campaigns: [{ id: "campaign-1", title: "Lion Heart: Guerra Sangrenta", description: "", tags: [], createdAt: 1, updatedAt: 1 }],
      pages: [{
        id: "page-legacy-1", scope: "campaign", campaignId: "campaign-1", kind: "mission", title: "Novo Capitão", contentHtml: "<p>Conteúdo.</p>", status: "Não Iniciada",
        obsidianPath: "Novo Capitao.md", obsidianSourceMarkdown: legacyMarkdown, createdAt: 1, updatedAt: 1,
      }],
      updatedAt: 1,
    })
    local.pages[0].obsidianFingerprint = pageObsidianFingerprint(local.pages[0], local)
    const files = new Map<string, string>([["Novo Capitao.md", legacyMarkdown]])
    let deleted = ""
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [...files.keys()],
      listBaseFiles: async () => ["Bases/base_mission_events.base"],
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 2 }),
      writeText: async (path, content) => { files.set(path, content) },
      writeBinary: async () => undefined,
      deleteFile: async (path) => { deleted = path; files.delete(path) },
    }
    const result = await synchronizeWorkspaceWithVault(local, adapter)
    expect(deleted).toBe("Novo Capitao.md")
    expect([...files.keys()]).toEqual(["Campanhas/Lion Heart Guerra Sangrenta/Eventos e Missões/Novo Capitão.md"])
    expect(result.state.pages[0].obsidianPath).toBe("Campanhas/Lion Heart Guerra Sangrenta/Eventos e Missões/Novo Capitão.md")
  })

  it("não reorganiza uma nota nativa do usuário sem runas_id mesmo com .base presente", async () => {
    const nativeMarkdown = '---\nObra de Origem:\n  - "[[Lion Heart (Campanha)]]"\n---\n# Nota Antiga\n\nConteúdo do usuário.\n'
    const local = normalizeKnowledgeWorkspace({})
    const files = new Map<string, string>([["Nota Antiga.md", nativeMarkdown]])
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [...files.keys()],
      listBaseFiles: async () => ["Bases/base_mission_events.base"],
      readNote: async (path) => ({ path, markdown: files.get(path)!, createdAt: 1, modifiedAt: 2 }),
      writeText: async (path, content) => { files.set(path, content) },
      writeBinary: async () => undefined,
      deleteFile: async (path) => { files.delete(path) },
    }
    await synchronizeWorkspaceWithVault(local, adapter)
    expect([...files.keys()]).toEqual(["Nota Antiga.md"])
  })

  it("prioriza a edição recém-salva pelo site sobre uma divergência antiga do vault", async () => {
    const local = structuredClone(state)
    const page = local.pages[0]
    page.obsidianPath = "Campanhas/A Queda de Zotera/Eventos e Missões/Portoes.md"
    page.obsidianSourceMarkdown = "# Versão inicial\n"
    page.obsidianFingerprint = pageObsidianFingerprint(page, local)
    page.title = "Portões do Norte (revisado no site)"
    page.updatedAt = 100
    const files = new Map<string, string>([["Campanhas/A Queda de Zotera/Eventos e Missões/Portoes.md", "# Alteração feita no Obsidian\n"]])
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => ["Campanhas/A Queda de Zotera/Eventos e Missões/Portoes.md"],
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
    page.obsidianPath = "Campanhas/A Queda de Zotera/Eventos e Missões/Portoes.md"
    page.obsidianSourceMarkdown = "# Versão inicial\n"
    page.obsidianFingerprint = pageObsidianFingerprint(page, local)
    page.contentHtml = "<p>Alteração local importante.</p>"
    page.updatedAt = 100
    const files = new Map<string, string>([["Campanhas/A Queda de Zotera/Eventos e Missões/Portoes.md", "# Alteração feita no Obsidian\n"]])
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => ["Campanhas/A Queda de Zotera/Eventos e Missões/Portoes.md"],
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

/**
 * Cronologia guarda eras e acontecimentos. A pasta vencia o frontmatter, e
 * todo acontecimento gravado ali voltava como era.
 */
describe("era x acontecimento em Cronologia", () => {
  it("subpasta Acontecimentos vale como acontecimento, mesmo sem tipo escrito", () => {
    const merged = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [
      { path: "Cronologia/Acontecimentos Regionais/Guerra de Lion Heart.md", markdown: "# Guerra de Lion Heart\n\nCaiu.\n", createdAt: 1, modifiedAt: 1 },
    ])
    expect(merged.state.pages.find((page) => page.title === "Guerra de Lion Heart")?.kind).toBe("event")
  })

  it("nota solta em Cronologia sem tipo é acontecimento, não era", () => {
    const merged = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [
      { path: "Cronologia/Calendário Logi.md", markdown: "# Calendário Logi\n\nComo se conta o tempo.\n", createdAt: 1, modifiedAt: 1 },
    ])
    expect(merged.state.pages.find((page) => page.title === "Calendário Logi")?.kind).toBe("event")
  })

  it("respeita o tipo escrito no arquivo, nos dois sentidos", () => {
    const era = '---\nrunas: true\nrunas_id: "era-monges"\nrunas_kind: "chronology"\nrunas_title: "Era dos Monges"\n---\n# Era dos Monges\n'
    const acontecimento = '---\nrunas: true\nrunas_id: "ev-1"\nrunas_kind: "event"\nrunas_title: "Guerra Rúnica"\n---\n# Guerra Rúnica\n'
    const merged = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [
      { path: "Cronologia/Era dos Monges.md", markdown: era, createdAt: 1, modifiedAt: 1 },
      { path: "Cronologia/Guerra Rúnica.md", markdown: acontecimento, createdAt: 1, modifiedAt: 1 },
    ])
    expect(merged.state.pages.find((page) => page.id === "era-monges")?.kind).toBe("chronology")
    expect(merged.state.pages.find((page) => page.id === "ev-1")?.kind).toBe("event")
  })
})

/**
 * Regressão relatada: importar uma campanha (ou tag) cujo nome começa com
 * `[nome]` devolvia `nome]`, porque todo texto que começava com `[` tinha o
 * `[` arrancado como se fosse o início de uma lista YAML. Cada volta pelo vault
 * criava campanha, pasta e tag duplicadas.
 */
describe("nomes com colchetes: campanha e tags nunca perdem o `[` inicial", () => {
  const CAMPAIGN = "[O&C] Lion Heart pt. II"
  const folder = `Campanhas/${CAMPAIGN}/Anotações`

  function importNotes(notes: Array<{ path: string; markdown: string }>) {
    return mergeObsidianNotes(normalizeKnowledgeWorkspace({}), notes.map((note) => ({ ...note, createdAt: 1, modifiedAt: 2 }))).state
  }

  const campaignForms: Array<[string, string]> = [
    ["texto entre aspas (o que o próprio Runas DM grava)", `campanha: "${CAMPAIGN}"`],
    ["texto sem aspas", `campanha: ${CAMPAIGN}`],
    ["texto com aspas simples", `campanha: '${CAMPAIGN}'`],
    ["lista do Obsidian com item entre aspas", `Campanha:\n  - "${CAMPAIGN}"`],
    ["lista do Obsidian com item sem aspas", `Campanha:\n  - ${CAMPAIGN}`],
    ["Obra de Origem", `Obra de Origem:\n  - "${CAMPAIGN}"`],
    ["wikilink para a nota-hub da campanha", `Campanha:\n  - "[[${CAMPAIGN} (Campanha)]]"`],
  ]

  it.each(campaignForms)("importa a campanha com o título exato: %s", (_label, property) => {
    const state = importNotes([{ path: `${folder}/Sessão 1.md`, markdown: `---\n${property}\n---\n# Sessão 1\n\nTexto.\n` }])
    expect(state.campaigns.map((campaign) => campaign.title)).toEqual([CAMPAIGN])
    expect(state.pages[0].campaignId).toBe(state.campaigns[0].id)
  })

  it("importa a nota-hub `[nome] … (Campanha).md` com o título exato, com ou sem cabeçalho", () => {
    const withHeading = importNotes([{ path: `Campanhas/${CAMPAIGN} (Campanha).md`, markdown: `# ${CAMPAIGN} (Campanha)\n\nHub.\n` }])
    const withoutHeading = importNotes([{ path: `Campanhas/${CAMPAIGN} (Campanha).md`, markdown: "Hub sem cabeçalho.\n" }])
    expect(withHeading.campaigns.map((campaign) => campaign.title)).toEqual([CAMPAIGN])
    expect(withoutHeading.campaigns.map((campaign) => campaign.title)).toEqual([CAMPAIGN])
  })

  it("um nome só de colchetes e um nome com vírgula continuam inteiros", () => {
    const bracketed = importNotes([{ path: "Campanhas/[nome]/Anotações/A.md", markdown: '---\ncampanha: "[nome]"\n---\n# A\n' }])
    const comma = importNotes([{ path: "Campanhas/A Queda, Parte 1/Anotações/A.md", markdown: '---\ncampanha: "A Queda, Parte 1"\n---\n# A\n' }])
    expect(bracketed.campaigns.map((campaign) => campaign.title)).toEqual(["[nome]"])
    expect(comma.campaigns.map((campaign) => campaign.title)).toEqual(["A Queda, Parte 1"])
  })

  it("conserta o nome que uma versão antiga já gravou sem o `[` e não duplica a campanha", () => {
    const damaged = `---\ncampanha: "O&C] Lion Heart pt. II"\n---\n# Sessão 1\n`
    const state = importNotes([
      { path: `${folder}/Sessão 1.md`, markdown: damaged },
      { path: `${folder}/Sessão 2.md`, markdown: `---\ncampanha: "${CAMPAIGN}"\n---\n# Sessão 2\n` },
    ])
    expect(state.campaigns.map((campaign) => campaign.title)).toEqual([CAMPAIGN])
  })

  it("a pasta da campanha nunca vira categoria ou tag da página, nem na primeira importação", () => {
    const withProperty = importNotes([{ path: `${folder}/Sessão 1.md`, markdown: `---\ncampanha: "${CAMPAIGN}"\n---\n# Sessão 1\n` }])
    const withoutProperty = importNotes([{ path: `${folder}/Sessão 1.md`, markdown: "# Sessão 1\n\nSem propriedade alguma.\n" }])
    for (const state of [withProperty, withoutProperty]) {
      expect(state.pages[0].tags).toContain("Anotações")
      expect(state.pages[0].tags).not.toContain(CAMPAIGN)
      expect(state.pages[0].tags).not.toContain("O&C] Lion Heart pt. II")
      expect(state.categories.map((category) => category.name)).not.toContain(CAMPAIGN)
    }
  })

  it("o formato antigo, sem pasta por campanha, continua tratando a pasta de tipo como categoria", () => {
    const state = importNotes([{ path: "Campanhas/Eventos e Missões/Novo Capitão.md", markdown: '---\nObra de Origem:\n  - "[[Lion Heart (Campanha)]]"\n---\n# Novo Capitão\n' }])
    expect(state.pages[0].tags).toContain("Eventos e Missões")
    expect(state.campaigns.map((campaign) => campaign.title)).toEqual(["Lion Heart"])
  })

  it("ida e volta pelo vault: o título da campanha e as tags voltam idênticos, e uma segunda volta não muda nada", () => {
    const original = normalizeKnowledgeWorkspace({
      campaigns: [{ id: "campaign-1", title: CAMPAIGN, description: "", tags: [], createdAt: 1, updatedAt: 1 }],
      pages: [{ id: "page-1", scope: "campaign", campaignId: "campaign-1", kind: "gm-note", title: "Sessão 1", contentHtml: "<p>Texto.</p>", tags: ["Sessões", CAMPAIGN, "[Segredo] Fim"], createdAt: 1, updatedAt: 1 }],
      updatedAt: 1,
    })
    const first = importNotes([{ path: organizedObsidianPathForPage({ ...original.pages[0], obsidianPath: "" }, original, ""), markdown: pageToMarkdown(original.pages[0], original) }])
    expect(first.campaigns.map((campaign) => campaign.title)).toEqual([CAMPAIGN])
    expect(first.pages[0].tags).toEqual(expect.arrayContaining(["Sessões", CAMPAIGN, "[Segredo] Fim"]))
    expect(first.tags.map((tag) => tag.name)).toEqual(expect.arrayContaining([CAMPAIGN, "[Segredo] Fim"]))

    const second = importNotes([{ path: first.pages[0].obsidianPath, markdown: pageToMarkdown({ ...first.pages[0], title: "Sessão 1 (revisada)" }, first) }])
    expect(second.campaigns.map((campaign) => campaign.title)).toEqual([CAMPAIGN])
    expect(second.pages[0].tags).toEqual(expect.arrayContaining(["Sessões", CAMPAIGN, "[Segredo] Fim"]))
    expect(second.tags.filter((tag) => tag.name === "O&C] Lion Heart pt. II" || tag.name === "Segredo] Fim")).toEqual([])
  })

  const tagForms: Array<[string, string, string[]]> = [
    ["array JSON gravado pelo Runas DM", `tags: ["${CAMPAIGN}", "Bar"]`, [CAMPAIGN, "Bar"]],
    ["texto único entre aspas", `tags: "${CAMPAIGN}"`, [CAMPAIGN]],
    ["texto único sem aspas", `tags: ${CAMPAIGN}`, [CAMPAIGN]],
    ["sequência sem aspas com um item entre colchetes", `tags: [runilita, ${CAMPAIGN}]`, ["runilita", CAMPAIGN]],
    ["lista de blocos com aspas", `tags:\n  - "${CAMPAIGN}"\n  - Bar`, [CAMPAIGN, "Bar"]],
    ["lista de blocos sem aspas", `tags:\n  - ${CAMPAIGN}\n  - Bar`, [CAMPAIGN, "Bar"]],
    ["categorias do formato antigo", `categorias: ${CAMPAIGN}`, [CAMPAIGN]],
    ["tag só de colchetes entre aspas", 'tags: ["[nome]"]', ["[nome]"]],
    ["hashtag do Obsidian", 'tags: ["#Bar"]', ["Bar"]],
    ["sequência simples (regressão)", "tags: [a, b]", ["a", "b"]],
    ["lista antiga separada por vírgula (regressão)", "tags: a, b", ["a", "b"]],
    ["nome que uma versão antiga já gravou sem o `[`", 'tags: ["O&C] Lion Heart pt. II"]', [CAMPAIGN]],
  ]

  it.each(tagForms)("importa as tags com o nome exato: %s", (_label, property, expected) => {
    const state = importNotes([{ path: "Geografia/Cidade.md", markdown: `---\n${property}\n---\n# Cidade\n\nTexto.\n` }])
    expect(state.pages[0].tags).toEqual(expected)
    expect(state.tags.map((tag) => tag.name)).toEqual(expect.arrayContaining(expected))
  })

  it("uma pasta de categoria com colchetes vira uma tag com o nome exato", () => {
    const state = importNotes([{ path: `Geografia/${CAMPAIGN}/Cidade.md`, markdown: "# Cidade\n" }])
    expect(state.pages[0].tags).toEqual([CAMPAIGN])
  })
})

describe("frontmatter reescrito pelo site", () => {
  it("`runas_story_view` aparece uma só vez, por mais que a nota seja regravada", () => {
    const story = '---\nrunas: true\nrunas_id: "story-1"\nrunas_scope: "wiki"\nrunas_kind: "story"\nrunas_title: "Os Perdidos"\nrunas_story_events: []\nrunas_story_view: "tale"\n---\n\n# Os Perdidos\n'
    let state = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [{ path: "História/Os Perdidos.md", markdown: story, createdAt: 1, modifiedAt: 2 }]).state
    for (const title of ["Os Perdidos", "Os Perdidos II", "Os Perdidos III"]) {
      const page = state.pages[0]
      const markdown = pageToMarkdown({ ...page, title }, state)
      expect(markdown.match(/^runas_story_view:/gm)).toHaveLength(1)
      state = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [{ path: "História/Os Perdidos.md", markdown, createdAt: 1, modifiedAt: 3 }]).state
    }
  })
})

/**
 * Regressão relatada: uma "série de backups do Livro Vermelho". Páginas do Livro
 * Vermelho já rastreadas no site (de importações antigas) eram regravadas a cada
 * sincronização: o site sobrescrevia a nota do Livro com a sua cópia e guardava a
 * versão do Livro como "backup" em Assets/Runas DM Backups.
 */
describe("pastas que não são do Runas DM nunca são tocadas", () => {
  const bookOriginal = "---\nrunas_book: true\nrunas_book_id: livro-vermelho-chapter-2-entry-2\nrunas_kind: rule\n---\n\n# Status\n\nPV, PA, PE.\n"
  const trackedBookPage = (path: string) => normalizeKnowledgeWorkspace({
    pages: [{ id: "page-livro", scope: "wiki", kind: "event", title: "Status", contentHtml: "<p>Cópia antiga do site</p>", obsidianPath: path, obsidianSourceMarkdown: "---\nruns: true\n---\n# Status\n\nCópia antiga do site\n", createdAt: 1, updatedAt: 1 }],
    updatedAt: 1,
  })

  function vault(path: string, markdown: string) {
    const files = new Map<string, string>([[path, markdown]])
    const writes: string[] = []
    const adapter: VaultAdapter = {
      listMarkdownFiles: async () => [...files.keys()],
      readNote: async (notePath) => ({ path: notePath, markdown: files.get(notePath)!, createdAt: 1, modifiedAt: 2 }),
      writeText: async (notePath, content) => { writes.push(notePath); files.set(notePath, content) },
      writeBinary: async () => undefined,
      deleteFile: async (notePath) => { writes.push(`apagou ${notePath}`); files.delete(notePath) },
    }
    return { files, writes, adapter }
  }

  it.each(["Runas Book/Livro Vermelho/Início/status.md", "Runas-Book/Livro Vermelho/Início/status.md", "_Arquivo morto/Geografia/Regiões/Mar.md", "Templates/Modelo.md"])("uma página rastreada em %s não é regravada, movida nem gera backup", async (path) => {
    const { files, writes, adapter } = vault(path, bookOriginal)
    const result = await synchronizeWorkspaceWithVault(trackedBookPage(path), adapter)
    expect(writes).toEqual([])
    expect(result.exported).toBe(0)
    expect(result.backups).toBe(0)
    expect(files.get(path)).toBe(bookOriginal)
    expect([...files.keys()].some((name) => name.startsWith("Assets/Runas DM Backups/"))).toBe(false)
  })

  it("o registro continua no site para o usuário removê-lo explicitamente, e nada dele vai para a nuvem nem para o vault", async () => {
    const { adapter } = vault("Runas Book/x.md", bookOriginal)
    const result = await synchronizeWorkspaceWithVault(trackedBookPage("Runas Book/x.md"), adapter)
    expect(result.state.pages.map((page) => page.id)).toEqual(["page-livro"])
    expect(pagesOutsideAllowedFolders(result.state).map((page) => page.id)).toEqual(["page-livro"])
  })

  it("uma página de campanha que o Runas DM gravou na raiz do vault continua sendo migrada para Campanhas/", async () => {
    // Migração legítima (plano v3, §5.1): não pode ser barrada pela lista de permissão.
    const markdown = '---\nrunas: true\nrunas_id: "page-legacy-2"\n---\n# Novo Capitão\n'
    const local = normalizeKnowledgeWorkspace({
      campaigns: [{ id: "campaign-1", title: "Lion Heart", createdAt: 1, updatedAt: 1 }],
      pages: [{ id: "page-legacy-2", scope: "campaign", campaignId: "campaign-1", kind: "mission", title: "Novo Capitão", contentHtml: "<p>x</p>", obsidianPath: "Novo Capitao.md", obsidianSourceMarkdown: markdown, createdAt: 1, updatedAt: 1 }],
      updatedAt: 1,
    })
    local.pages[0].obsidianFingerprint = pageObsidianFingerprint(local.pages[0], local)
    const { files, adapter } = vault("Novo Capitao.md", markdown)
    ;(adapter as { listBaseFiles?: () => Promise<string[]> }).listBaseFiles = async () => ["Bases/x.base"]
    await synchronizeWorkspaceWithVault(local, adapter)
    expect([...files.keys()]).toEqual(["Campanhas/Lion Heart/Eventos e Missões/Novo Capitão.md"])
  })

  it("a lista de permissão é a única fonte: as sete seções, o alias legado e Campanhas", () => {
    for (const root of ["Cronologia", "Cronologia Geral", "História", "Geografia", "Personagens", "Criaturas", "Itens", "Organizações", "Campanhas", "organizações", "CAMPANHAS"]) expect(isSynchronizableRootFolder(root), root).toBe(true)
    for (const root of ["Runas Book", "Runas-Book", "Runas DM", "Outros Documentos", "_Arquivo morto", "Templates", "Bases", "Assets", "Histórias", "Notas", ".obsidian", ""]) expect(isSynchronizableRootFolder(root), root).toBe(false)
  })

  it("o backup de uma nota tem o mesmo nome para o mesmo conteúdo: um laço nunca gera cópias repetidas", async () => {
    const original = "# Nota\n\nTexto do Obsidian.\n"
    // A nota foi importada do vault (baseline = `original`) e depois editada no site: a próxima
    // sincronização regrava o arquivo e guarda o texto do Obsidian como backup.
    const imported = normalizeKnowledgeWorkspace({
      pages: [{ id: "p1", scope: "wiki", kind: "geography", title: "Nota", contentHtml: "<p>Texto do Obsidian.</p>", obsidianPath: "Geografia/Nota.md", obsidianSourceMarkdown: original, createdAt: 1, updatedAt: 5 }],
      updatedAt: 5,
    })
    const fingerprint = pageObsidianFingerprint(imported.pages[0], imported)
    const edited = { ...imported, pages: [{ ...imported.pages[0], obsidianFingerprint: fingerprint, contentHtml: "<p>Texto do site</p>", updatedAt: 9 }] }
    const first = vault("Geografia/Nota.md", original)
    const firstResult = await synchronizeWorkspaceWithVault(edited, first.adapter)
    expect(firstResult.backups).toBe(1)
    const second = vault("Geografia/Nota.md", original)
    await synchronizeWorkspaceWithVault(edited, second.adapter)
    const backups = (files: Map<string, string>) => [...files.keys()].filter((name) => name.startsWith("Assets/Runas DM Backups/"))
    expect(backups(first.files)).toHaveLength(1)
    expect(backups(first.files)).toEqual(backups(second.files))
    expect(backups(first.files)[0]).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(first.files.get(backups(first.files)[0])).toBe(original)
    expect(first.files.get("Geografia/Nota.md")).toContain("Texto do site")
  })
})

describe("nome do arquivo = título exato", () => {
  it("mantém acentos, vírgulas e parênteses; só troca o que o sistema de arquivos e os links não aceitam", () => {
    expect(noteFileName("Batalha de Méfise", "x")).toBe("Batalha de Méfise")
    expect(noteFileName("Luís, o Coração de Leão", "x")).toBe("Luís, o Coração de Leão")
    expect(noteFileName("Era das Máquinas (Solaris)", "x")).toBe("Era das Máquinas (Solaris)")
    expect(noteFileName('Quem? "Ele": a/b\\c|d*e<f>g', "x")).toBe("Quem Ele a b c d e f g")
    expect(noteFileName("Capítulo #1 [rascunho] ^ fim", "x")).toBe("Capítulo 1 rascunho fim")
    expect(noteFileName("  Muitos    espaços  ", "x")).toBe("Muitos espaços")
    expect(noteFileName("Termina com ponto...", "x")).toBe("Termina com ponto")
    expect(noteFileName("???", "Página sem nome")).toBe("Página sem nome")
    expect(noteFileName("x".repeat(400), "x")).toHaveLength(150)
  })

  it("normaliza para NFC, como o Obsidian, para o nome não depender de como o teclado compôs o acento", () => {
    expect(noteFileName("Me\u0301fise", "x")).toBe("Méfise")
    expect(noteFileName("Me\u0301fise", "x")).toBe(noteFileName("Méfise", "x"))
  })

  it("é o nome usado para gravar a página, e os vínculos `[[título]]` passam a achar a nota", () => {
    const state = normalizeKnowledgeWorkspace({
      pages: [{ id: "p1", scope: "wiki", kind: "event", title: "Batalha de Méfise", contentHtml: "", createdAt: 1, updatedAt: 1 }],
      updatedAt: 1,
    })
    expect(obsidianPathForPage(state.pages[0], state, "")).toBe("História/Acontecimentos/Batalha de Méfise.md")
  })
})

describe("Personagens não tem subpastas", () => {
  it("uma personagem nova fica na raiz da seção, seja qual for a primeira tag; as outras seções continuam por tag", () => {
    const state = normalizeKnowledgeWorkspace({
      pages: [
        { id: "p1", scope: "wiki", kind: "characters", title: "Martim", tags: ["runilita", "jogador"], contentHtml: "", createdAt: 1, updatedAt: 1 },
        { id: "p2", scope: "wiki", kind: "geography", title: "Duna", tags: ["Assentamentos"], contentHtml: "", createdAt: 1, updatedAt: 1 },
      ],
      updatedAt: 1,
    })
    expect(obsidianPathForPage(state.pages[0], state, "")).toBe("Personagens/Martim.md")
    expect(obsidianPathForPage(state.pages[1], state, "")).toBe("Geografia/Assentamentos/Duna.md")
    // As tags continuam gravadas no frontmatter.
    expect(pageToMarkdown(state.pages[0], state)).toContain('tags: ["runilita", "jogador"]')
  })
})

describe("Cronologia: uma pasta por era", () => {
  it("uma era nova mora na própria pasta; uma página de Cronologia que já tem tag continua na pasta da tag", () => {
    const state = normalizeKnowledgeWorkspace({
      pages: [
        { id: "era-nova", scope: "wiki", kind: "chronology", title: "Era das Máquinas", contentHtml: "", createdAt: 1, updatedAt: 1 },
        { id: "cron-tag", scope: "wiki", kind: "chronology", title: "Linha do tempo", tags: ["Acontecimentos Globais"], contentHtml: "", createdAt: 1, updatedAt: 1 },
      ],
      updatedAt: 1,
    })
    expect(obsidianPathForPage(state.pages[0], state, "")).toBe("Cronologia/Era das Máquinas/Era das Máquinas.md")
    expect(obsidianPathForPage(state.pages[1], state, "")).toBe("Cronologia/Acontecimentos Globais/Linha do tempo.md")
  })
})

describe("o resumo derivado do primeiro bloco não duplica o começo da nota", () => {
  it("reconhece um resumo tirado do começo do corpo, inclusive o de um callout que o navegador separa em citações", () => {
    // É o Markdown que `htmlToMarkdown` devolve no navegador para um callout importado.
    const body = "> [!história] Fundação\n\n> Um dos primeiros assentamentos da [[Província Rúnica]].\n\n## Fontes\n\n- [OxC] Hillhorn.docx"
    expect(bodyStartsWithSummary(body, "> [!história] Fundação > Um dos primeiros assentamentos da [[Província Rúnica]].")).toBe(true)
    expect(bodyStartsWithSummary("Capital de Bretade.\n\nFundada numa planície.", "Capital de Bretade.")).toBe(true)
    expect(bodyStartsWithSummary(body, "Um resumo escrito à parte")).toBe(false)
    expect(bodyStartsWithSummary(body, "")).toBe(false)
    expect(bodyStartsWithSummary(body, "   ")).toBe(false)
  })

  it("reescrever uma nota nativa cujo resumo foi derivado do texto não repete o parágrafo no corpo", () => {
    const source = "---\nTipo: Assentamento\n---\n# Cidade do Destino\n\nUm dos primeiros assentamentos, fundado após a Queda.\n\n## Fontes\n\n- [OxC] Hillhorn.docx\n"
    const imported = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [{ path: "Geografia/Assentamentos/Cidade do Destino.md", markdown: source, createdAt: 1, modifiedAt: 2 }]).state
    const page = imported.pages[0]
    expect(page.summary).toBe("Um dos primeiros assentamentos, fundado após a Queda.")
    const rewritten = pageToMarkdown({ ...page, title: "Cidade do Destino (revisada)" }, imported)
    const afterFrontmatter = rewritten.slice(rewritten.indexOf("\n---\n", 4) + 5)
    expect(afterFrontmatter.match(/Um dos primeiros assentamentos/g)).toHaveLength(1)
    // O resumo continua no frontmatter, que é onde ele mora.
    expect(rewritten).toContain('runas_summary: "Um dos primeiros assentamentos, fundado após a Queda."')
  })

  it("um resumo escrito à parte continua saindo como parágrafo antes do texto", () => {
    const state = normalizeKnowledgeWorkspace({
      pages: [{ id: "p1", scope: "wiki", kind: "geography", title: "Duna", summary: "Capital de Bretade.", contentHtml: "<p>Fundada numa grande planície.</p>", createdAt: 1, updatedAt: 1 }],
      updatedAt: 1,
    })
    const markdown = pageToMarkdown(state.pages[0], state)
    expect(markdown).toContain("# Duna\n\nCapital de Bretade.\n\nFundada numa grande planície.")
  })
})

describe("campos que só existem no site sobrevivem a reler a nota", () => {
  const eraMarkdown = '---\nrunas: true\nrunas_id: "era-monges"\nrunas_scope: "wiki"\nrunas_kind: "chronology"\nrunas_title: "Era dos Monges"\n---\n# Era dos Monges\n\nTexto editado no Obsidian.\n'

  it("o intervalo de anos, o calendário, o ícone e a cor da era não são zerados quando o texto muda no Obsidian", () => {
    const local = normalizeKnowledgeWorkspace({
      pages: [{ id: "era-monges", scope: "wiki", kind: "chronology", title: "Era dos Monges", eraStartYear: 100, eraEndYear: 900, eraCalendar: "Solaris", icon: "🏯", accentColor: "#c9a227", obsidianPath: "Cronologia/Era dos Monges/Era dos Monges.md", obsidianSourceMarkdown: "# Era dos Monges\n", createdAt: 1, updatedAt: 1 }],
      updatedAt: 1,
    })
    local.pages[0].obsidianFingerprint = pageObsidianFingerprint(local.pages[0], local)
    const merged = mergeObsidianNotes(local, [{ path: "Cronologia/Era dos Monges/Era dos Monges.md", markdown: eraMarkdown, createdAt: 1, modifiedAt: 50 }])
    expect(merged.state.pages[0]).toMatchObject({ eraStartYear: 100, eraEndYear: 900, eraCalendar: "Solaris", icon: "🏯", accentColor: "#c9a227" })
    expect(merged.state.pages[0].contentHtml).toContain("Texto editado no Obsidian")
  })

  it("uma era canônica que chega pela primeira vez, sem anos, recebe os do documento; uma que já tem anos não muda", () => {
    const fresh = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [{ path: "Cronologia/Era dos Monges/Era dos Monges.md", markdown: eraMarkdown, createdAt: 1, modifiedAt: 2 }]).state
    expect(fresh.pages[0]).toMatchObject({ id: "era-monges", eraStartYear: 0, eraEndYear: 1489, eraCalendar: "C.E." })
    const undefinedEra = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [{ path: "Cronologia/Era dos Magos/Era dos Magos.md", markdown: eraMarkdown.replaceAll("era-monges", "era-magos").replaceAll("Monges", "Magos"), createdAt: 1, modifiedAt: 2 }]).state
    expect(undefinedEra.pages[0].eraStartYear ?? null).toBeNull()
    const custom = mergeObsidianNotes(normalizeKnowledgeWorkspace({}), [{ path: "Cronologia/Era Minha/Era Minha.md", markdown: '---\nrunas_id: "era-minha"\nrunas_kind: "chronology"\n---\n# Era Minha\n', createdAt: 1, modifiedAt: 2 }]).state
    expect(custom.pages[0].eraStartYear ?? null).toBeNull()
  })
})

describe("remover do site as páginas fora das pastas permitidas", () => {
  const withOutsidePages = () => normalizeKnowledgeWorkspace({
    campaigns: [{ id: "campaign-1", title: "Lion Heart", worldPageIds: ["page-livro", "page-duna"], storyIds: ["page-livro"], createdAt: 1, updatedAt: 1 }],
    pages: [
      { id: "page-livro", scope: "wiki", kind: "event", title: "Status", contentHtml: "<p>Do Livro</p>", obsidianPath: "Runas Book/Status.md", createdAt: 1, updatedAt: 1 },
      { id: "page-livro-2", scope: "wiki", kind: "event", title: "Capítulo 2", contentHtml: "<p>Do Livro</p>", obsidianPath: "Runas-Book/Capítulo 2.md", createdAt: 1, updatedAt: 1 },
      { id: "page-duna", scope: "wiki", kind: "geography", title: "Duna", contentHtml: "<p>Capital</p>", obsidianPath: "Geografia/Assentamentos/Duna.md", linkedPageIds: ["page-livro", "page-cidade"], createdAt: 1, updatedAt: 1 },
      { id: "page-cidade", scope: "wiki", kind: "geography", title: "Cidade", contentHtml: "<p>Nova</p>", createdAt: 1, updatedAt: 1 },
    ],
    deletedIds: ["antiga"],
    updatedAt: 1,
  })

  it("tira só o registro dessas páginas, guarda a lápide e limpa quem as referenciava", () => {
    const before = withOutsidePages()
    expect(pagesOutsideAllowedFolders(before).map((page) => page.id)).toEqual(["page-livro", "page-livro-2"])
    const after = removePagesOutsideAllowedFolders(before)
    expect(after.pages.map((page) => page.id)).toEqual(["page-duna", "page-cidade"])
    expect(after.deletedIds).toEqual(expect.arrayContaining(["antiga", "page-livro", "page-livro-2"]))
    expect(after.pages[0].linkedPageIds).toEqual(["page-cidade"])
    expect(after.campaigns[0].worldPageIds).toEqual(["page-duna"])
    expect(after.campaigns[0].storyIds).toEqual([])
    expect(pagesOutsideAllowedFolders(after)).toEqual([])
  })

  it("não toca no que está dentro do escopo, nem cria um estado novo quando não há nada a remover", () => {
    const before = withOutsidePages()
    const after = removePagesOutsideAllowedFolders(before)
    // Uma página que não citava as removidas continua sendo o mesmo objeto (o fingerprint e o `.md` não mudam).
    expect(after.pages[1]).toBe(before.pages[3])
    expect(removePagesOutsideAllowedFolders(after)).toBe(after)
  })

  it("um backup antigo que ainda traz essas páginas não as devolve numa mesclagem", () => {
    const stale = withOutsidePages()
    const cleaned = removePagesOutsideAllowedFolders(withOutsidePages())
    const merged = applyCloudBackup(cleaned, stale, "merge")
    expect(merged.pages.map((page) => page.id).sort()).toEqual(["page-cidade", "page-duna"])
  })
})

describe("ZIP de exportação", () => {
  it("leva uma nota por página, o LEIA-ME e os arquivos de dados enviados pelo chamador, nesta ordem", () => {
    const state = normalizeKnowledgeWorkspace({
      pages: [
        { id: "p1", scope: "wiki", kind: "geography", title: "Duna", tags: ["Assentamentos"], contentHtml: "<p>Capital</p>", createdAt: 1, updatedAt: 1 },
        { id: "p2", scope: "wiki", kind: "characters", title: "Luís, o Coração de Leão", tags: ["nobres"], contentHtml: "<p>Rei</p>", createdAt: 1, updatedAt: 1 },
      ],
      updatedAt: 1,
    })
    const files = buildKnowledgeZipFiles(state, [{ name: "Runas DM/wiki-e-campanhas.json", content: "{}" }])
    expect(files.map((file) => file.name)).toEqual([
      "Geografia/Assentamentos/Duna.md",
      "Personagens/Luís, o Coração de Leão.md",
      "LEIA-ME Runas DM.md",
      "Runas DM/wiki-e-campanhas.json",
    ])
    expect(files.at(-1)?.content).toBe("{}")
    expect(files[2].content).toContain("Outros Documentos")
    expect(files[2].content).toContain("Runas DM")
  })

  it("não exporta os registros de notas de outros apps (Livro Vermelho) e não repete nome", () => {
    const state = normalizeKnowledgeWorkspace({
      pages: [
        { id: "livro-1", scope: "wiki", kind: "event", title: "Status", contentHtml: "<p>x</p>", obsidianPath: "Runas Book/Status.md", createdAt: 1, updatedAt: 1 },
        { id: "aaaa1111", scope: "wiki", kind: "geography", title: "Duna", tags: ["Assentamentos"], contentHtml: "<p>a</p>", createdAt: 1, updatedAt: 1 },
        { id: "bbbb2222", scope: "wiki", kind: "geography", title: "Duna", tags: ["Assentamentos"], contentHtml: "<p>b</p>", createdAt: 1, updatedAt: 1 },
      ],
      updatedAt: 1,
    })
    const names = buildKnowledgeZipFiles(state).map((file) => file.name)
    expect(names).toEqual(["Geografia/Assentamentos/Duna.md", "Geografia/Assentamentos/Duna (bbbb2222).md", "LEIA-ME Runas DM.md"])
  })
})

describe("citações e callouts", () => {
  it("linhas `>` seguidas formam uma única citação (é o callout do Obsidian); uma linha em branco separa citações", () => {
    expect(markdownToHtml("> [!resumo] Visão geral\n> Capital de Bretade.\n\nTexto")).toBe("<blockquote>[!resumo] Visão geral<br>Capital de Bretade.</blockquote><p>Texto</p>")
    expect(markdownToHtml("> a\n\n> b")).toBe("<blockquote>a</blockquote><blockquote>b</blockquote>")
    expect(markdownToHtml("Antes\n> a\n> b\nDepois")).toBe("<p>Antes</p><blockquote>a<br>b</blockquote><p>Depois</p>")
  })

  it("mantém as linhas em branco dentro da citação e não agrupa `>` de dentro de um bloco de código", () => {
    expect(markdownToHtml("> a\n>\n> b")).toBe("<blockquote>a<br><br>b</blockquote>")
    expect(markdownToHtml("```\n> não é citação\n```")).toBe("<pre><code>&gt; não é citação</code></pre>")
    expect(markdownToHtml("> [!tip] Título\n> corpo com [[Link]]")).toContain('<blockquote>[!tip] Título<br>corpo com <a href="#wiki:Link"')
  })
})
