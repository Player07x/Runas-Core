import { CAMPAIGN_PAGE_KINDS, CAMPAIGN_STATUSES, WIKI_NESTED_KINDS, WIKI_SECTIONS, createCampaign, createKnowledgeId, normalizeKnowledgeWorkspace, pageKindLabel, wikiLinkTitles, withStoryEvents, type CampaignRecord, type KnowledgeCategory, type KnowledgePage, type KnowledgePageKind, type KnowledgeWorkspaceState } from "./knowledge-model"
import { createTextZip, downloadBlob, safeFilename } from "./export"
import { cacheVaultAsset, readCachedVaultAsset } from "./vault-assets"
import { fictionalYear } from "./chronology"
import { normalizeMissionOrder } from "./knowledge-model"

export const WIKI_VAULT_FOLDERS = WIKI_SECTIONS.map((section) => section.label)
/** Pasta raiz da seção História; cada história vira uma subpasta com seus acontecimentos. */
export const STORY_VAULT_FOLDER = WIKI_SECTIONS.find((section) => section.id === "story")?.label ?? "História"
// Campanhas faz parte do arquivo sincronizado. Bases continua fora da
// interface, mas seus arquivos `.base` são lidos pelo adaptador para ativar a
// organização física das novas notas. Runas-Book é a pasta raiz de outro app
// (@runas/book) que pode compartilhar o mesmo vault; seu conteúdo nunca
// pertence à Wiki/Campanhas do Runas DM.
export const IGNORED_VAULT_FOLDERS = [".obsidian", ".trash", "Assets", "Bases", "Templates", "Notas", "Histórias", "Historias", "Campanhas", "Runas-Book"]
export const CAMPAIGN_VAULT_FOLDER = "Campanhas"

export interface VaultNote {
  path: string
  markdown: string
  modifiedAt: number
  createdAt: number
  frontmatter?: Record<string, unknown>
}

export interface VaultAdapter {
  listMarkdownFiles(rootFolder: string): Promise<string[]>
  /** Arquivos de organização do Obsidian; nunca são exibidos como páginas. */
  listBaseFiles?(rootFolder: string): Promise<string[]>
  readNote(path: string): Promise<VaultNote>
  readBinary?(path: string): Promise<Blob | null>
  listAssetFiles?(rootFolder: string): Promise<string[]>
  writeText(path: string, content: string): Promise<void>
  writeBinary(path: string, content: Blob): Promise<void>
  /** Usado somente para remover o caminho antigo depois de reorganizar uma nota já gravada pelo Runas DM. */
  deleteFile?(path: string): Promise<void>
}

export interface VaultSyncResult {
  state: KnowledgeWorkspaceState
  imported: number
  exported: number
  backups: number
}

export type VaultSyncPriority = "obsidian" | "site"

function yaml(value: string | number | boolean): string {
  return JSON.stringify(value)
}

/** Serializa de volta propriedades desconhecidas na mesma sintaxe simples aceita por `parseMarkdownFrontmatter`. */
function extraFrontmatterLines(extra: Record<string, unknown>): string[] {
  return Object.entries(extra).flatMap(([key, value]) => {
    if (Array.isArray(value)) return [`${key}:`, ...value.map((item) => `  - ${yaml(String(item))}`)]
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [`${key}: ${yaml(value)}`]
    return []
  })
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim().replace(/^#/, "")).filter(Boolean)
  if (typeof value !== "string") return []
  const source = value.trim().replace(/^\[/, "").replace(/\]$/, "")
  return source.split(/[,\n]/).map((item) => item.trim().replace(/^['"]|['"]$/g, "").replace(/^#/, "")).filter(Boolean)
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback
}

function filePart(value: string, fallback: string): string {
  return safeFilename(value, fallback).replace(/_/g, " ")
}

function folderPart(value: string, fallback: string): string {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").replace(/[. ]+$/, "") || fallback
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").split("/").map((part) => part.trim()).filter((part) => part && part !== "." && part !== "..").join("/")
}

function joinVaultPath(...parts: string[]): string {
  return parts.map(normalizePath).filter(Boolean).join("/")
}

function rootPath(rootFolder: string): string {
  return normalizePath(rootFolder)
}

function pathInsideRoot(path: string, rootFolder: string): string {
  const root = rootPath(rootFolder)
  return root ? joinVaultPath(root, path) : normalizePath(path)
}

function kindLabel(page: KnowledgePage): string {
  return pageKindLabel(page.kind, page.scope)
}

function storyFolderOf(page: KnowledgePage, state: KnowledgeWorkspaceState): string {
  const story = state.pages.find((candidate) => candidate.scope === "wiki" && candidate.kind === "story" && candidate.storyEventIds.includes(page.id))
  return folderPart(story?.title ?? "", "Acontecimentos")
}

function normalizedLabel(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR")
}

function vaultPathIdentity(path: string): string {
  return normalizePath(path).split("/").map((part) => normalizedLabel(part) === "cronologia geral" ? "cronologia" : normalizedLabel(part)).join("/")
}

/**
 * Uma pasta só conta como a seção da Wiki (ou "Campanhas") quando está na
 * raiz do vault. Sem essa checagem, uma pasta de mesmo nome dentro de outro
 * app que compartilhe o vault (ex.: `Runas-Book/Personagens`) seria lida como
 * se fosse a pasta raiz `Personagens` da Wiki do Runas DM.
 */
export function isIgnoredVaultPath(path: string): boolean {
  const parts = normalizePath(path).split("/")
  const rootLabel = normalizedLabel(parts[0] ?? "")
  // `Campanhas` entra aqui junto das seções da Wiki. Ela está em
  // `IGNORED_VAULT_FOLDERS` por herança: a lista nasceu para a importação da
  // Wiki, quando as campanhas chegavam por outro caminho. Com a lista de
  // permissão (plano v3, §5.1), `Campanhas/<Campanha>/…` é a casa oficial das
  // notas de campanha — deixá-la na exclusão descartava todas elas.
  const sectionIndex = rootLabel === "cronologia geral"
    || rootLabel === normalizedLabel(CAMPAIGN_VAULT_FOLDER)
    || WIKI_SECTIONS.some((section) => normalizedLabel(section.label) === rootLabel) ? 0 : -1
  const ignoredIndex = parts.findIndex((part) => IGNORED_VAULT_FOLDERS.some((folder) => normalizedLabel(folder) === normalizedLabel(part)))
  return ignoredIndex >= 0 && (sectionIndex < 0 || ignoredIndex < sectionIndex)
}

export function isSynchronizableVaultPath(path: string): boolean {
  const parts = normalizePath(path).split("/")
  const root = normalizedLabel(parts[0] ?? "")
  const allowedWiki = root === "cronologia geral" || WIKI_SECTIONS.some((section) => normalizedLabel(section.label) === root)
  const allowedCampaign = root === normalizedLabel(CAMPAIGN_VAULT_FOLDER)
  if (!allowedWiki && !allowedCampaign) return false
  return !isIgnoredVaultPath(path)
}

/**
 * Páginas já rastreadas cujo `.md` está fora das pastas permitidas — tipicamente
 * notas de outro universo que a importação antiga trouxe para a Wiki.
 *
 * Elas não são removidas pela sincronização (plano v3, §5.1.5): a limpeza é uma
 * ação explícita do mestre, tira o registro do site e nunca toca no arquivo do
 * vault.
 */
export function pagesOutsideAllowedFolders(state: KnowledgeWorkspaceState): KnowledgePage[] {
  return state.pages.filter((page) => Boolean(page.obsidianPath) && !isSynchronizableVaultPath(page.obsidianPath as string))
}

function kindFromValue(value: unknown, scope: "wiki" | "campaign", fallback?: KnowledgePageKind): KnowledgePageKind {
  const candidate = normalizedLabel(text(value))
  const options: readonly { id: KnowledgePageKind; label: string }[] = scope === "wiki" ? [...WIKI_SECTIONS, ...WIKI_NESTED_KINDS] : CAMPAIGN_PAGE_KINDS
  return options.find((item) => normalizedLabel(item.id) === candidate || normalizedLabel(item.label) === candidate)?.id
    ?? fallback
    ?? (scope === "wiki" ? "chronology" : "gm-note")
}

/**
 * Cronologia guarda eras **e** acontecimentos, então a pasta sozinha não
 * decide o tipo — e decidia: `location.kind` vencia o frontmatter, e todo
 * acontecimento gravado ali voltava como era, inclusive os que traziam
 * `runas_kind: "event"` escrito.
 *
 * A ordem passa a ser: subpasta `Acontecimento…` é sempre acontecimento;
 * fora dela vale o tipo escrito no arquivo; e uma nota sem tipo nenhum é
 * acontecimento, porque era nasce do próprio Runas DM e sempre sai com
 * `runas_kind` preenchido.
 */
function chronologyKind(path: string, frontmatter: Record<string, unknown>): KnowledgePageKind {
  const parts = normalizePath(path).split("/")
  if (normalizedLabel(parts[1] ?? "").startsWith("acontecimento")) return "event"
  const declared = normalizedLabel(text(frontmatter.runas_kind ?? frontmatter.tipo))
  if (declared === "event" || declared === "acontecimento" || declared === "evento") return "event"
  if (declared === "chronology" || declared === "cronologia" || declared === "era") return "chronology"
  return "event"
}

function wikiLocation(path: string): { kind: KnowledgePageKind; category: string } | null {
  const parts = normalizePath(path).split("/")
  const rootLabel = normalizedLabel(parts[0] ?? "")
  const matchesSection = rootLabel === "cronologia geral" || WIKI_SECTIONS.some((section) => normalizedLabel(section.label) === rootLabel)
  if (!matchesSection) return null
  const folder = rootLabel === "cronologia geral" ? "Cronologia" : parts[0]
  const section = WIKI_SECTIONS.find((candidate) => normalizedLabel(candidate.label) === normalizedLabel(folder))
  if (!section) return null
  // Em História, a subpasta é a própria história, não uma categoria: o que
  // está dentro dela é um acontecimento daquela história.
  if (section.id === "story") return { kind: parts.length > 2 ? "event" : "story", category: "" }
  return { kind: section.id, category: parts.length > 2 ? parts[1] : "" }
}

/**
 * `Campanhas/<Nome da campanha>/<Tipo>/arquivo.md` é a estrutura que o próprio
 * Runas DM grava. Ao importar de volta, o segmento do nome da campanha nunca
 * deve virar "categoria" da página — ele só identifica a campanha, que já é
 * resolvida pelo frontmatter (`campanha`/`runas_campaign_id`).
 */
function campaignLocation(path: string, campaigns: CampaignRecord[] = []): { category: string } | null {
  const parts = normalizePath(path).split("/")
  if (normalizedLabel(parts[0] ?? "") !== normalizedLabel(CAMPAIGN_VAULT_FOLDER)) return null
  const campaignSegment = parts[1] ?? ""
  const isCampaignFolder = campaigns.some((campaign) => normalizedLabel(folderPart(campaign.title, "")) === normalizedLabel(campaignSegment))
  const category = parts[isCampaignFolder ? 2 : 1] ?? ""
  return { category: category && !category.toLocaleLowerCase("pt-BR").endsWith(".md") ? category : "" }
}

function campaignFor(page: KnowledgePage, campaigns: CampaignRecord[]): CampaignRecord | undefined {
  return campaigns.find((campaign) => campaign.id === page.campaignId)
}

/**
 * O Obsidian grava uma única entrada como lista YAML (`- "[[Nota]]"`), não como
 * escalar. `Obra de Origem` e `Campanha` são usados de forma intercambiável no
 * vault real para apontar a campanha de origem de uma nota.
 */
function referencedCampaignTitle(frontmatter: Record<string, unknown>): string {
  const references = [...stringArray(frontmatter.campanha), ...stringArray(frontmatter.Campanha), ...stringArray(frontmatter["Obra de Origem"])]
  for (const reference of references) {
    const title = (wikiLinkTitles(reference)[0] ?? reference).replace(/\s*\(campanha\)$/i, "").trim()
    if (title) return title
  }
  return ""
}

export function pageObsidianFingerprint(page: KnowledgePage, state: KnowledgeWorkspaceState): string {
  const links = state.pages.filter((candidate) => page.linkedPageIds.includes(candidate.id)).map((candidate) => candidate.title).sort()
  return JSON.stringify({
    title: page.title, scope: page.scope, campaign: campaignFor(page, state.campaigns)?.title ?? "", kind: page.kind,
    summary: page.summary, contentHtml: page.contentHtml, status: page.status, date: page.date,
    tags: [...page.tags].sort(), links, bestiaryEntryId: page.bestiaryEntryId,
    encounterCreatures: page.encounterCreatures,
    ...(page.order ? { order: page.order } : {}),
    ...(page.eraId ? { eraId: page.eraId } : {}),
    ...(page.eventYear != null ? { eventYear: page.eventYear } : {}),
    ...(page.storyEventIds.length ? { storyEventIds: page.storyEventIds } : {}),
    ...(page.kind === "story" ? { storyViewMode: page.storyViewMode ?? "tale" } : {}),
  })
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function renderInlineMarkdown(value: string): string {
  const tokens: string[] = []
  const token = (html: string) => {
    const index = tokens.push(html) - 1
    return `\u0000${index}\u0000`
  }
  let rendered = value
    .replace(/!\[\[([^\]]+)\]\]/g, (_match, target: string) => token(`<span data-obsidian-embed="${escapeHtml(target.trim())}">![[${escapeHtml(target.trim())}]]</span>`))
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, title: string, alias?: string) => token(`<a href="#wiki:${encodeURIComponent(title.trim())}" data-wiki-title="${escapeHtml(title.trim())}">${escapeHtml((alias || title).trim())}</a>`))
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|obsidian:[^\s)]+|#[^\s)]+)\)/g, (_match, label: string, href: string) => token(`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`))
  rendered = escapeHtml(rendered)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
  return rendered.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => tokens[Number(index)] ?? "")
}

/** Conversão conservadora para editar Markdown existente sem executar HTML arbitrário. */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const output: string[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let code: string[] | null = null
  const flushParagraph = () => { if (paragraph.length) output.push(`<p>${renderInlineMarkdown(paragraph.join(" ").trim())}</p>`); paragraph = [] }
  const flushList = () => {
    if (!list) return
    const tag = list.ordered ? "ol" : "ul"
    output.push(`<${tag}>${list.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${tag}>`)
    list = null
  }
  for (const line of lines) {
    if (line.startsWith("```")) {
      flushParagraph(); flushList()
      if (code) { output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`); code = null } else code = []
      continue
    }
    if (code) { code.push(line); continue }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (heading) {
      flushParagraph(); flushList(); output.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`)
    } else if (unordered || ordered) {
      flushParagraph()
      const isOrdered = Boolean(ordered)
      if (list && list.ordered !== isOrdered) flushList()
      list ??= { ordered: isOrdered, items: [] }
      list.items.push((unordered?.[1] ?? ordered?.[1] ?? "").trim())
    } else if (/^>\s?/.test(line)) {
      flushParagraph(); flushList(); output.push(`<blockquote>${renderInlineMarkdown(line.replace(/^>\s?/, ""))}</blockquote>`)
    } else if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph(); flushList(); output.push("<hr>")
    } else if (!line.trim()) {
      flushParagraph(); flushList()
    } else paragraph.push(line.trim())
  }
  flushParagraph(); flushList()
  if (code) output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`)
  return output.join("")
}

export function htmlToMarkdown(value: string): string {
  if (typeof DOMParser === "undefined") return value.replace(/<[^>]+>/g, "").trim()
  const documentValue = new DOMParser().parseFromString(value, "text/html")
  const render = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
    if (!(node instanceof HTMLElement)) return ""
    const wikiTitle = node.getAttribute("data-wiki-title")
    if (node.tagName === "A" && wikiTitle) return `[[${wikiTitle}]]`
    const embed = node.getAttribute("data-obsidian-embed")
    if (embed) return `![[${embed}]]`
    const children = [...node.childNodes].map(render).join("")
    switch (node.tagName) {
      case "H1": return `# ${children.trim()}\n\n`
      case "H2": return `## ${children.trim()}\n\n`
      case "H3": return `### ${children.trim()}\n\n`
      case "P": return `${children.trim()}\n\n`
      case "DIV": return `${children.trim()}\n\n`
      case "BR": return "\n"
      case "STRONG": case "B": return `**${children}**`
      case "EM": case "I": return `*${children}*`
      case "U": return `<u>${children}</u>`
      case "BLOCKQUOTE": return children.split("\n").filter(Boolean).map((line) => `> ${line}`).join("\n") + "\n\n"
      case "UL": return `${[...node.children].map((child) => `- ${render(child).trim()}`).join("\n")}\n\n`
      case "OL": return `${[...node.children].map((child, index) => `${index + 1}. ${render(child).trim()}`).join("\n")}\n\n`
      case "LI": return children
      case "A": return `[${children}](${node.getAttribute("href") ?? ""})`
      case "IMG": {
        const obsidianPath = node.getAttribute("data-obsidian-path")
        return obsidianPath ? `![[${obsidianPath}]]\n\n` : `![${node.getAttribute("alt") ?? "Imagem"}](${node.getAttribute("src") ?? ""})\n\n`
      }
      case "HR": return "---\n\n"
      case "CODE": return `\`${children}\``
      case "PRE": return `\`\`\`\n${children.trim()}\n\`\`\`\n\n`
      default: return children
    }
  }
  return [...documentValue.body.childNodes].map(render).join("").replace(/\n{3,}/g, "\n\n").trim()
}

export function pageToMarkdown(page: KnowledgePage, state: KnowledgeWorkspaceState): string {
  if (page.obsidianSourceMarkdown && page.obsidianFingerprint === pageObsidianFingerprint(page, state)) return page.obsidianSourceMarkdown
  const campaign = campaignFor(page, state.campaigns)
  const linked = state.pages.filter((candidate) => page.linkedPageIds.includes(candidate.id)).map((candidate) => candidate.title)
  const frontmatter = [
    "---", "runas: true", `runas_id: ${yaml(page.id)}`, `runas_scope: ${yaml(page.scope)}`, `runas_kind: ${yaml(page.kind)}`,
    `runas_title: ${yaml(page.title)}`, `runas_summary: ${yaml(page.summary)}`, `Resumo: ${yaml(page.summary)}`, `runas_created_at: ${page.createdAt}`, `runas_updated_at: ${page.updatedAt}`,
    `tipo: ${yaml(kindLabel(page))}`, `status: ${yaml(page.status)}`,
    page.date ? `data: ${yaml(page.date)}` : "", page.date ? `Data: ${yaml(page.date)}` : "", campaign ? `campanha: ${yaml(campaign.title)}` : "",
    campaign ? `runas_campaign_id: ${yaml(campaign.id)}` : "",
    `tags: [${page.tags.map(yaml).join(", ")}]`,
    `runas_linked_ids: [${page.linkedPageIds.map(yaml).join(", ")}]`,
    page.order ? `ordem: ${yaml(page.order)}` : "",
    page.eraId ? `runas_era: ${yaml(page.eraId)}` : "",
    page.eventYear != null ? `ano_evento: ${page.eventYear}` : "",
    page.bestiaryEntryId ? `ficha_bestiario: ${yaml(page.bestiaryEntryId)}` : "",
    page.kind === "story" ? `runas_story_events: [${page.storyEventIds.map(yaml).join(", ")}]` : "",
    page.kind === "story" ? `runas_story_view: ${yaml(page.storyViewMode ?? "tale")}` : "",
    ...extraFrontmatterLines(page.obsidianExtraFrontmatter), "---",
  ].filter(Boolean).join("\n")
  // A História já é a lista de tópicos dos seus eventos; repeti-la como
  // "Páginas relacionadas" só duplicaria os mesmos links no arquivo.
  const relations = linked.length && page.kind !== "story" ? `\n\n## Páginas relacionadas\n${linked.map((title) => `- [[${title}]]`).join("\n")}` : ""
  const encounter = page.encounterCreatures.length ? `\n\n## Fichas do encontro\n${page.encounterCreatures.map((item) => `- ${item.quantity}× ${item.name} \`${item.entryId}\``).join("\n")}` : ""
  // A História grava a lista a partir da própria ordem dos eventos, sem
  // depender do DOM: o corpo do arquivo é exatamente os tópicos com os links.
  const storyBody = page.storyEventIds.flatMap((id) => {
    const event = state.pages.find((candidate) => candidate.id === id)
    return event ? [`- [[${event.title || "Evento sem nome"}]]`] : []
  }).join("\n")
  const body = page.kind === "encounter" ? "" : page.kind === "story" ? storyBody : htmlToMarkdown(page.contentHtml)
  return `${frontmatter}\n\n# ${page.title}\n\n${page.summary ? `${page.kind === "encounter" ? "## Notas do mestre\n\n" : ""}${page.summary}\n\n` : ""}${body}${relations}${encounter}\n`
}

/** Wiki usa pasta por seção e, quando presente, a primeira tag como subpasta. */
export function obsidianPathForPage(page: KnowledgePage, state: KnowledgeWorkspaceState, rootFolder = ""): string {
  if (page.obsidianPath) return normalizePath(page.obsidianPath)
  const filename = `${filePart(page.title, "Página sem nome")}.md`
  if (page.scope === "campaign") {
    const campaignFolder = folderPart(campaignFor(page, state.campaigns)?.title ?? "", "Sem campanha")
    const folder = page.kind === "mission" || page.kind === "event" ? "Eventos e Missões" : page.kind === "encounter" ? "Encontros" : "Anotações"
    return pathInsideRoot(joinVaultPath(CAMPAIGN_VAULT_FOLDER, campaignFolder, folder, filename), rootFolder)
  }
  // Um evento da Wiki pertence a uma história e mora na pasta dela.
  if (page.kind === "event") return pathInsideRoot(joinVaultPath(STORY_VAULT_FOLDER, storyFolderOf(page, state), filename), rootFolder)
  const section = WIKI_SECTIONS.find((candidate) => candidate.id === page.kind)?.label ?? "Cronologia"
  // Snapshots v2 ainda podem não ter `tags`; a leitura compatível usa a
  // categoria legada apenas para calcular o caminho físico. Novas páginas
  // sempre chegam aqui com tags.
  const legacyPrimaryCategory = state.categories.find((category) => page.categoryIds.includes(category.id) && category.scope === "wiki")?.name
  const primaryTag = page.tags[0] ?? legacyPrimaryCategory
  return pathInsideRoot(joinVaultPath(section, primaryTag ? folderPart(primaryTag, "Tag") : "", filename), rootFolder)
}

/** Organização usada quando o vault possui pelo menos um arquivo `.base`. */
export function organizedObsidianPathForPage(page: KnowledgePage, state: KnowledgeWorkspaceState, rootFolder = ""): string {
  if (page.obsidianPath) return normalizePath(page.obsidianPath)
  const filename = `${filePart(page.title, "Página sem nome")}.md`
  if (page.scope === "wiki") return obsidianPathForPage(page, state, rootFolder)
  // Cada campanha ganha sua própria subpasta: sem isso, missões, anotações e
  // encontros de campanhas diferentes cairiam todos nas mesmas pastas
  // genéricas de "Campanhas", misturando o conteúdo de aventuras distintas.
  const campaignFolder = folderPart(campaignFor(page, state.campaigns)?.title ?? "", "Sem campanha")
  const defaultFolder = page.kind === "mission" || page.kind === "event"
    ? "Eventos e Missões"
    : page.kind === "session-note" ? "Anotações/Sessões"
      : page.kind === "encounter" ? "Encontros" : "Anotações"
  const folder = defaultFolder
  return pathInsideRoot(joinVaultPath(CAMPAIGN_VAULT_FOLDER, campaignFolder, folder, filename), rootFolder)
}

export function exportKnowledgeZip(state: KnowledgeWorkspaceState): void {
  const used = new Set<string>()
  const files = state.pages.map((page) => {
    let name = obsidianPathForPage({ ...page, obsidianPath: "" }, state, "")
    if (used.has(normalizedLabel(name))) name = name.replace(/\.md$/i, ` (${page.id.slice(-8)}).md`)
    used.add(normalizedLabel(name))
    return { name, content: pageToMarkdown(page, state) }
  })
  files.push({ name: "LEIA-ME Runas DM.md", content: "---\nrunas_system: true\n---\n\n# Arquivo Runas DM\n\nA Wiki usa as pastas Cronologia, História, Geografia, Personagens, Criaturas, Itens e Organizações. Cada história é uma subpasta de História, com um arquivo por acontecimento. A primeira tag define a subpasta física; todas as tags ficam no frontmatter. Anexos ficam em `Assets`.\n" })
  const zip = createTextZip(files)
  const buffer = new ArrayBuffer(zip.byteLength)
  new Uint8Array(buffer).set(zip)
  downloadBlob(new Blob([buffer], { type: "application/zip" }), `runas-dm-obsidian-${new Date().toISOString().slice(0, 10)}.zip`)
}

function parseYamlScalar(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try { return JSON.parse(trimmed) } catch { /* YAML simples continua abaixo. */ }
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
  return trimmed.replace(/^['"]|['"]$/g, "")
}

export function parseMarkdownFrontmatter(markdown: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = markdown.replace(/\r\n?/g, "\n")
  if (!normalized.startsWith("---\n")) return { frontmatter: {}, body: normalized }
  const end = normalized.indexOf("\n---", 4)
  if (end < 0) return { frontmatter: {}, body: normalized }
  const source = normalized.slice(4, end).split("\n")
  const frontmatter: Record<string, unknown> = {}
  let listKey = ""
  for (const line of source) {
    const listItem = line.match(/^\s+-\s+(.+)$/)
    if (listItem && listKey) {
      const current = Array.isArray(frontmatter[listKey]) ? frontmatter[listKey] as unknown[] : []
      current.push(parseYamlScalar(listItem[1])); frontmatter[listKey] = current
      continue
    }
    const field = line.match(/^([^:#][^:]*):\s*(.*)$/)
    if (!field) continue
    listKey = field[1].trim()
    frontmatter[listKey] = field[2].trim() ? parseYamlScalar(field[2]) : []
  }
  return { frontmatter, body: normalized.slice(end + 4).replace(/^\n+/, "") }
}

function titleFromMarkdown(body: string, path: string): string {
  // Só a primeira linha do corpo pode definir o título por cabeçalho: com a
  // flag `m`, o regex antigo casava com QUALQUER `# Cabeçalho` do documento,
  // então uma nota longa cuja primeira seção interna fosse `# Personalidade`
  // ou `# História` (sem título próprio antes) tinha esse texto adotado como
  // título da página — colidindo com toda outra nota na mesma situação.
  const firstLine = body.trimStart().split("\n", 1)[0]
  const heading = firstLine.match(/^#\s+(.+)$/)?.[1].trim()
  return heading || decodeURIComponent(path.split("/").pop()?.replace(/\.md$/i, "") ?? "Página sem nome")
}

/**
 * O plugin Bases do Obsidian mostra um catálogo dentro de uma nota comum que
 * só serve de vitrine, com `![[arquivo.base]]` como único conteúdo. Essa nota
 * não é uma página do site, assim como o próprio arquivo `.base` não é.
 */
function isBaseEmbedOnlyNote(body: string): boolean {
  const withoutTitle = body.replace(/^#\s+.+\n+/, "").trim()
  return /^!\[\[[^\]]+\.base\]\]$/i.test(withoutTitle)
}

/**
 * A nota-hub "<Nome> (Campanha)" só identifica a campanha; nunca deve virar
 * uma KnowledgePage rastreada. Do contrário, ela seria reexportada para
 * sempre a partir do estado do site, mesmo depois de apagada diretamente
 * pelo Obsidian -- o arquivo "voltava sozinho" mesmo sem a campanha ter sido
 * excluída pelo site. A checagem usa só o caminho (pasta + nome do
 * arquivo), nunca o conteúdo, para funcionar mesmo com o arquivo já apagado.
 */
function isCampaignHubNotePath(path: string, campaigns: CampaignRecord[]): boolean {
  if (wikiLocation(path)) return false
  if (!campaignLocation(path, campaigns)) return false
  const filename = path.split("/").pop()?.replace(/\.md$/i, "") ?? ""
  return /\(campanha\)$/i.test(filename)
}

function contentMarkdown(body: string, title: string, summary: string): string {
  let result = body.replace(new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n+`, "i"), "")
  result = result.replace(/\n*##\s+Páginas relacionadas\s*\n[\s\S]*?(?=\n##\s+Fichas do encontro|$)/i, "")
  result = result.replace(/\n*##\s+Fichas do encontro\s*\n[\s\S]*$/i, "")
  result = result.replace(/^##\s+Notas do mestre\s*\n+/i, "")
  if (summary && result.startsWith(summary)) result = result.slice(summary.length).replace(/^\s+/, "")
  return result.trim()
}

/**
 * O nome derivado da nota-hub (`Lion Heart (Campanha)` → `Lion Heart`) costuma
 * ser só o prefixo do título completo que o mestre deu à campanha no site
 * (`Lion Heart: Guerra Sangrenta`). Sem essa comparação por prefixo, toda
 * importação criaria uma campanha duplicada.
 */
function campaignTitleMatches(existingTitle: string, reference: string): boolean {
  const existing = normalizedLabel(existingTitle)
  const target = normalizedLabel(reference)
  if (!target || existing === target) return existing === target
  if (!existing.startsWith(target)) return false
  const boundary = existing[target.length]
  return !boundary || /[^a-z0-9]/.test(boundary)
}

function ensureCampaign(campaigns: CampaignRecord[], idValue: string, titleValue: string, createdAt: number, updatedAt: number): CampaignRecord | null {
  if (!idValue && !titleValue) return null
  const existing = campaigns.find((campaign) => campaign.id === idValue || campaignTitleMatches(campaign.title, titleValue))
  if (existing) return existing
  const campaign = createCampaign(titleValue || "Campanha importada")
  campaign.id = idValue || campaign.id
  campaign.createdAt = createdAt
  campaign.updatedAt = updatedAt
  campaigns.push(campaign)
  return campaign
}

function ensureCategories(categories: KnowledgeCategory[], names: string[], scope: "wiki" | "campaign", campaignId: string | null): string[] {
  return names.map((name) => {
    const existing = categories.find((category) => category.scope === scope && category.campaignId === campaignId && normalizedLabel(category.name) === normalizedLabel(name))
    if (existing) return existing.id
    const category: KnowledgeCategory = { id: createKnowledgeId("category"), scope, campaignId, name, parentId: null }
    categories.push(category)
    return category.id
  })
}

function statusFromValue(value: unknown): KnowledgePage["status"] {
  return CAMPAIGN_STATUSES.includes(value as KnowledgePage["status"]) ? value as KnowledgePage["status"] : "Sem Status"
}

/** Chaves que `pageToMarkdown` já escreve; qualquer outra propriedade do Obsidian é preservada como extra. */
const KNOWN_FRONTMATTER_KEYS = new Set([
  "runas", "runas_id", "runas_scope", "runas_kind", "runas_title", "runas_summary", "Resumo", "runas_created_at", "runas_updated_at",
  "tipo", "status", "data", "Data", "campanha", "runas_campaign_id", "tags", "categorias", "runas_linked_ids",
  "ordem", "runas_era", "ano_evento", "ficha_bestiario", "runas_story_events",
])

function extraFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(frontmatter)) {
    if (KNOWN_FRONTMATTER_KEYS.has(key)) continue
    if (Array.isArray(value) || typeof value === "string" || typeof value === "number" || typeof value === "boolean") extra[key] = value
  }
  return extra
}

function noteToPage(note: VaultNote, state: KnowledgeWorkspaceState, fallback?: KnowledgePage): KnowledgePage {
  const parsed = parseMarkdownFrontmatter(note.markdown)
  const frontmatter = { ...parsed.frontmatter, ...(note.frontmatter ?? {}) }
  // A localização física dentro de uma das seis pastas da Wiki vence qualquer
  // sinal do frontmatter: personagens da Wiki costumam referenciar sua
  // campanha de origem em "Obra de Origem"/"Campanha" sem deixar de pertencer
  // à Wiki (ex.: Personagens/Runilitas/Martim.md aponta para a campanha
  // "Lion Heart", mas continua sendo uma página da Wiki).
  const wikiLocationMatch = wikiLocation(note.path)
  const locationCampaign = wikiLocationMatch ? null : campaignLocation(note.path, state.campaigns)
  const titleCandidate = titleFromMarkdown(parsed.body, note.path)
  const campaignTitle = wikiLocationMatch ? "" : referencedCampaignTitle(frontmatter) || (locationCampaign && /\(campanha\)$/i.test(titleCandidate) ? titleCandidate.replace(/\s*\(campanha\)$/i, "").trim() : "")
  const scope: "wiki" | "campaign" = wikiLocationMatch ? "wiki" : (text(frontmatter.runas_scope) === "campaign" || Boolean(campaignTitle) || Boolean(locationCampaign) ? "campaign" : "wiki")
  const location = scope === "wiki" ? wikiLocationMatch : null
  const campaign = scope === "campaign" ? ensureCampaign(state.campaigns, text(frontmatter.runas_campaign_id), campaignTitle, note.createdAt, note.modifiedAt) : null
  const title = text(frontmatter.runas_title) || text(frontmatter.title) || titleFromMarkdown(parsed.body, note.path)
  const summary = text(frontmatter.runas_summary) || text(frontmatter.Resumo) || text(frontmatter.resumo)
  const content = contentMarkdown(parsed.body, title, summary)
  const kind = location?.kind === "chronology"
    ? chronologyKind(note.path, frontmatter)
    : location?.kind ?? kindFromValue(frontmatter.runas_kind ?? frontmatter.tipo, scope)
  const page: KnowledgePage = {
    id: text(frontmatter.runas_id) || fallback?.id || createKnowledgeId("page"),
    scope,
    campaignId: campaign?.id ?? null,
    // Dentro das seis pastas canônicas, a localização física é a fonte de verdade.
    // Isso também corrige frontmatter antigo que tenha sido salvo como `chronology`.
    kind,
    title,
    summary: summary || content.split(/\n\s*\n/).find((block) => !/^\s*(#|[-*+]\s)/.test(block))?.replace(/\s+/g, " ").slice(0, 280) || "",
    contentHtml: markdownToHtml(content),
    status: statusFromValue(frontmatter.status),
    date: text(frontmatter.data ?? frontmatter.Data ?? frontmatter.date),
    order: normalizeMissionOrder(frontmatter.ordem ?? fallback?.order),
    eraId: text(frontmatter.runas_era ?? fallback?.eraId),
    eventYear: fictionalYear(frontmatter.ano_evento ?? fallback?.eventYear),
    backgroundImageDataUrl: fallback?.backgroundImageDataUrl ?? "",
    tags: [...new Set([...stringArray(frontmatter.tags), ...stringArray(frontmatter.categorias), ...(wikiLocationMatch?.category ? [wikiLocationMatch.category] : [])])],
    categoryIds: [],
    linkedPageIds: stringArray(frontmatter.runas_linked_ids),
    bestiaryEntryId: text(frontmatter.ficha_bestiario) || null,
    storyEventIds: kind === "story" ? stringArray(frontmatter.runas_story_events) : [],
    storyViewMode: text(frontmatter.runas_story_view) === "chronology" ? "chronology" : "tale",
    encounterCreatures: fallback?.encounterCreatures ?? [],
    obsidianPath: normalizePath(note.path),
    obsidianExtraFrontmatter: extraFrontmatter(frontmatter),
    obsidianSourceMarkdown: note.markdown,
    obsidianFingerprint: "",
    obsidianModifiedAt: note.modifiedAt,
    createdAt: Number(frontmatter.runas_created_at) || fallback?.createdAt || note.createdAt,
    updatedAt: Number(frontmatter.runas_updated_at) || note.modifiedAt,
  }
  page.categoryIds = ensureCategories(state.categories, [...new Set([...(location?.category ? [location.category] : []), ...(locationCampaign?.category && scope === "campaign" ? [locationCampaign.category] : [])])], scope, page.campaignId)
  return page
}

export function mergeObsidianNotes(localState: KnowledgeWorkspaceState, notes: VaultNote[]): { state: KnowledgeWorkspaceState; imported: number } {
  const state = normalizeKnowledgeWorkspace(structuredClone(localState))
  // Uma página já rastreada fora das pastas permitidas **não** é descartada
  // aqui: o plano v3 (§5.1.5) manda listá-la e deixar a remoção explícita, com
  // `pagesOutsideAllowedFolders`. Apagar em silêncio levava junto o que só
  // precisava ser remanejado — uma página de campanha gravada na raiz do vault
  // antes da reorganização sumia antes de a própria sincronização movê-la.
  // Uma sincronização anterior a esta correção pode ter rastreado a nota-hub
  // como página. Precisa ser removida aqui, e não só quando a nota é lida de
  // novo, pois o arquivo já pode ter sido apagado direto pelo Obsidian --
  // sem lápide, ela sobreviveria intacta e a exportação abaixo a recriaria.
  const trackedHubIds = state.pages.filter((page) => page.obsidianPath && isCampaignHubNotePath(page.obsidianPath, state.campaigns)).map((page) => page.id)
  if (trackedHubIds.length) {
    const hubIdSet = new Set(trackedHubIds)
    state.pages = state.pages.filter((page) => !hubIdSet.has(page.id))
    state.deletedIds = [...new Set([...state.deletedIds, ...trackedHubIds])]
  }
  const importedPages: { pageId: string; markdown: string }[] = []
  let imported = 0
  for (const note of notes) {
    // A lista de permissão é deliberada: notas de outros universos, arquivos
    // soltos na raiz e conteúdo do Runas Book jamais entram no workspace,
    // mesmo que tragam um `runas_id` antigo.
    if (!isSynchronizableVaultPath(note.path)) continue
    const parsed = parseMarkdownFrontmatter(note.markdown)
    const noteFrontmatter = { ...parsed.frontmatter, ...(note.frontmatter ?? {}) }
    if (noteFrontmatter.runas_system === true) continue
    // A nota-hub só estabelece a campanha; nunca vira página (ver acima).
    if (isCampaignHubNotePath(note.path, state.campaigns)) {
      const hubTitle = titleFromMarkdown(parsed.body, note.path).replace(/\s*\(campanha\)$/i, "").trim()
      ensureCampaign(state.campaigns, text(noteFrontmatter.runas_campaign_id), hubTitle, note.createdAt, note.modifiedAt)
      continue
    }
    // Uma nota-vitrine de catálogo (Bases) não é conteúdo: remove qualquer
    // página que uma sincronização antiga tenha criado a partir dela e nunca
    // importa outra no lugar.
    if (isBaseEmbedOnlyNote(parsed.body)) {
      const existingCatalogIndex = state.pages.findIndex((page) => normalizedLabel(page.obsidianPath) === normalizedLabel(note.path))
      if (existingCatalogIndex >= 0) state.pages.splice(existingCatalogIndex, 1)
      continue
    }
    // Índices e documentos de configuração do vault não são páginas do site.
    // Arquivos `.base` nem chegam a esta lista, pois somente Markdown é lido.
    if (normalizePath(note.path).split("/").some((part) => part.startsWith("_")) && !noteFrontmatter.runas_id) continue
    const id = text(noteFrontmatter.runas_id)
    let existingIndex = state.pages.findIndex((page) => (id && page.id === id) || normalizedLabel(page.obsidianPath) === normalizedLabel(note.path))
    if (existingIndex < 0 && !id) {
      const title = text(noteFrontmatter.runas_title) || text(noteFrontmatter.title) || titleFromMarkdown(parsed.body, note.path)
      const isWikiLocation = Boolean(wikiLocation(note.path))
      const campaignTitle = isWikiLocation ? "" : referencedCampaignTitle(noteFrontmatter)
      const scope = isWikiLocation ? "wiki" : (text(noteFrontmatter.runas_scope) === "campaign" || Boolean(campaignTitle) || Boolean(campaignLocation(note.path, state.campaigns)) ? "campaign" : "wiki")
      const matches = state.pages.map((page, index) => ({ page, index })).filter(({ page }) => page.scope === scope && normalizedLabel(page.title) === normalizedLabel(title))
      if (matches.length === 1) existingIndex = matches[0].index
    }
    const existing = existingIndex >= 0 ? state.pages[existingIndex] : undefined
    const remote = noteToPage(note, state, existing)
    let adoptedRemote = !existing
    if (existing) {
      const hasBaseline = Boolean(existing.obsidianSourceMarkdown && existing.obsidianFingerprint)
      const localChanged = hasBaseline && existing.obsidianFingerprint !== pageObsidianFingerprint(existing, state)
      const remoteChanged = !hasBaseline || existing.obsidianSourceMarkdown !== note.markdown
      if (hasBaseline && localChanged && remoteChanged) {
        state.pages.push({ ...existing, id: createKnowledgeId("page-conflict"), title: `${existing.title} (cópia local em conflito)`, obsidianPath: "", obsidianSourceMarkdown: "", obsidianFingerprint: "", obsidianModifiedAt: 0, updatedAt: Date.now() })
      }
      if (!hasBaseline || (remoteChanged && note.modifiedAt >= existing.updatedAt)) {
        state.pages[existingIndex] = remote
        adoptedRemote = true
        imported += 1
      }
      else {
        adoptedRemote = false
        const location = existing.scope === "wiki" ? wikiLocation(note.path) : null
        const retained = {
          ...existing,
          kind: location?.kind ?? existing.kind,
          categoryIds: [...new Set([...existing.categoryIds, ...remote.categoryIds])],
          tags: [...new Set([...existing.tags, ...(location?.category ? [location.category] : [])])],
          obsidianPath: remote.obsidianPath,
          obsidianModifiedAt: note.modifiedAt,
          obsidianSourceMarkdown: note.markdown,
        }
        // Uma correção derivada somente da pasta não representa edição local.
        // Mantemos, porém, a assinatura antiga quando havia conteúdo local alterado.
        retained.obsidianFingerprint = localChanged ? existing.obsidianFingerprint : pageObsidianFingerprint(retained, state)
        state.pages[existingIndex] = retained
      }
    } else {
      state.pages.push(remote)
      imported += 1
    }
    if (adoptedRemote) importedPages.push({ pageId: existingIndex >= 0 ? state.pages[existingIndex].id : remote.id, markdown: note.markdown })
  }

  // `Cronologia Geral` foi o nome legado da pasta. Se o mesmo documento já foi
  // importado antes e depois da renomeação, conserva o registro do caminho atual
  // e redireciona vínculos externos, em vez de exibir duas páginas.
  const currentPathByIdentity = new Map(notes.map((note) => [vaultPathIdentity(note.path), normalizePath(note.path)]))
  const winnerByIdentity = new Map<string, KnowledgePage>()
  for (const page of state.pages) {
    if (!page.obsidianPath) continue
    const identity = vaultPathIdentity(page.obsidianPath)
    const currentPath = currentPathByIdentity.get(identity)
    if (!currentPath) continue
    const current = winnerByIdentity.get(identity)
    const pageUsesCurrentPath = normalizedLabel(page.obsidianPath) === normalizedLabel(currentPath)
    const currentUsesCurrentPath = current ? normalizedLabel(current.obsidianPath) === normalizedLabel(currentPath) : false
    if (!current || (pageUsesCurrentPath && !currentUsesCurrentPath) || (pageUsesCurrentPath === currentUsesCurrentPath && page.updatedAt > current.updatedAt)) {
      winnerByIdentity.set(identity, page)
    }
  }
  const duplicateRedirect = new Map<string, string>()
  for (const page of state.pages) {
    if (!page.obsidianPath) continue
    const identity = vaultPathIdentity(page.obsidianPath)
    const winner = winnerByIdentity.get(identity)
    if (winner && winner.id !== page.id) duplicateRedirect.set(page.id, winner.id)
  }
  if (duplicateRedirect.size) {
    state.pages = state.pages.filter((page) => !duplicateRedirect.has(page.id)).map((page) => ({
      ...page,
      linkedPageIds: [...new Set(page.linkedPageIds.map((id) => duplicateRedirect.get(id) ?? id).filter((id) => id !== page.id))],
    }))
    for (const importedPage of importedPages) importedPage.pageId = duplicateRedirect.get(importedPage.pageId) ?? importedPage.pageId
  }
  const pageByTitle = new Map(state.pages.map((page) => [normalizedLabel(page.title), page.id]))
  for (const importedPage of importedPages) {
    const page = state.pages.find((candidate) => candidate.id === importedPage.pageId)
    if (!page) continue
    const resolved = wikiLinkTitles(importedPage.markdown).map((title) => pageByTitle.get(normalizedLabel(title))).filter((id): id is string => Boolean(id) && id !== page.id)
    page.linkedPageIds = [...new Set([...page.linkedPageIds.filter((id) => state.pages.some((candidate) => candidate.id === id)), ...resolved])]
    page.obsidianFingerprint = pageObsidianFingerprint(page, state)
  }
  reconcileStories(state)
  state.updatedAt = Math.max(state.updatedAt, ...notes.map((note) => note.modifiedAt), 0)
  return { state: normalizeKnowledgeWorkspace(state), imported }
}

/**
 * A sequência gravada no frontmatter manda, mas um evento criado direto no
 * Obsidian dentro da pasta da história também precisa entrar na lista — e um
 * evento apagado por lá precisa sair dela, junto com seu link no corpo.
 */
function reconcileStories(state: KnowledgeWorkspaceState): void {
  const storyRoot = normalizedLabel(STORY_VAULT_FOLDER)
  for (const [index, story] of state.pages.entries()) {
    if (story.scope !== "wiki" || story.kind !== "story") continue
    const folder = normalizedLabel(folderPart(story.title, ""))
    const known = story.storyEventIds.filter((id) => state.pages.some((candidate) => candidate.id === id))
    const nested = state.pages.filter((candidate) => {
      if (candidate.scope !== "wiki" || candidate.kind !== "event" || known.includes(candidate.id)) return false
      const parts = normalizePath(candidate.obsidianPath).split("/")
      return parts.length > 2 && normalizedLabel(parts[0]) === storyRoot && normalizedLabel(parts[1]) === folder
    }).sort((a, b) => a.title.localeCompare(b.title, "pt-BR")).map((candidate) => candidate.id)
    const eventIds = [...known, ...nested]
    if (eventIds.length === story.storyEventIds.length && eventIds.every((id, position) => id === story.storyEventIds[position])) continue
    const updated = withStoryEvents(story, eventIds, state.pages)
    state.pages[index] = { ...updated, obsidianFingerprint: pageObsidianFingerprint(updated, state) }
  }
}

async function cacheEmbeddedVaultImages(state: KnowledgeWorkspaceState, adapter: VaultAdapter, rootFolder: string): Promise<KnowledgeWorkspaceState> {
  if (!adapter.readBinary || typeof DOMParser === "undefined") return state
  const assetPaths = adapter.listAssetFiles ? await adapter.listAssetFiles(rootFolder).catch(() => []) : []
  const assetsByName = new Map<string, string[]>()
  for (const path of assetPaths) {
    const name = normalizedLabel(path.split("/").pop() ?? "")
    assetsByName.set(name, [...(assetsByName.get(name) ?? []), path])
  }
  for (const page of state.pages) {
    if (!page.contentHtml.includes("data-obsidian-embed") && !page.contentHtml.includes("data-obsidian-path")) continue
    const documentValue = new DOMParser().parseFromString(page.contentHtml, "text/html")
    const embeds = [...documentValue.body.querySelectorAll<HTMLElement>("[data-obsidian-embed]")]
    const images = [...documentValue.body.querySelectorAll<HTMLImageElement>("img[data-obsidian-path]")]
    for (const element of [...embeds, ...images]) {
      const raw = (element instanceof HTMLImageElement ? element.dataset.obsidianPath : element.dataset.obsidianEmbed)?.trim() ?? ""
      const target = raw.split("|")[0].split("#")[0].trim()
      if (!/\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(target)) continue
      // Uma imagem já convertida e com o binário em cache local não precisa
      // ser relida do disco a cada sincronização: isso multiplicava a
      // leitura de arquivos em vaults com muitos retratos, deixando a
      // sincronização automática lenta demais para terminar antes de o
      // usuário navegar para outra rota e interrompê-la sem gravar nada.
      if (element instanceof HTMLImageElement && await readCachedVaultAsset(raw)) continue
      const basenameMatches = assetsByName.get(normalizedLabel(target.split("/").pop() ?? "")) ?? []
      const candidates = target.includes("/") ? [pathInsideRoot(target, rootFolder)] : [pathInsideRoot(`Assets/${target}`, rootFolder), ...basenameMatches, pathInsideRoot(target, rootFolder)]
      let content: Blob | null = null
      for (const candidate of candidates) {
        content = await adapter.readBinary(candidate)
        if (content) break
      }
      if (!content) continue
      await cacheVaultAsset(raw, content).catch(() => undefined)
      if (!(element instanceof HTMLImageElement)) {
        const image = documentValue.createElement("img")
        image.alt = target.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Imagem"
        image.dataset.obsidianPath = raw
        image.dataset.width = "25"
        image.dataset.align = "left"
        image.style.width = "25%"
        element.replaceWith(image)
      }
    }
    page.contentHtml = documentValue.body.innerHTML
    page.obsidianFingerprint = pageObsidianFingerprint(page, state)
  }
  return state
}

/**
 * `fetch()` de uma URL `data:` é bloqueado pelo `connect-src` da CSP (que não
 * inclui e não deveria precisar incluir o esquema `data:`), então a conversão
 * decodifica a URI diretamente em vez de depender de rede para dados que já
 * estão no próprio documento.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/)
  if (!match) throw new Error("URL de imagem inválida.")
  const [, mime, isBase64, data] = match
  const type = mime || "application/octet-stream"
  if (isBase64) {
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type })
  }
  return new Blob([decodeURIComponent(data)], { type })
}

async function pageWithVaultAttachments(page: KnowledgePage, adapter: VaultAdapter, rootFolder: string): Promise<KnowledgePage> {
  if (typeof DOMParser === "undefined" || !page.contentHtml.includes("data:image/")) return page
  const documentValue = new DOMParser().parseFromString(page.contentHtml, "text/html")
  const images = [...documentValue.body.querySelectorAll<HTMLImageElement>("img[src^='data:image/']")]
  for (const [index, image] of images.entries()) {
    const source = image.getAttribute("src")
    if (!source) continue
    const blob = dataUrlToBlob(source)
    const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/gif" ? "gif" : "jpg"
    const path = pathInsideRoot(`Assets/${filePart(page.title, "Imagem")}-${page.id.slice(-8)}-${index + 1}.${extension}`, rootFolder)
    await adapter.writeBinary(path, blob)
    await cacheVaultAsset(path, blob)
    image.removeAttribute("src")
    // O Markdown usa o nome do anexo, como no Obsidian (`![[imagem.png]]`),
    // enquanto o arquivo continua fisicamente dentro de `Assets`.
    const assetName = path.split("/").pop() ?? path
    image.setAttribute("data-obsidian-path", assetName)
    await cacheVaultAsset(assetName, blob).catch(() => undefined)
  }
  return { ...page, contentHtml: documentValue.body.innerHTML }
}

function backupPath(path: string, rootFolder: string): string {
  const filename = filePart(path.split("/").pop()?.replace(/\.md$/i, "") ?? "Documento", "Documento")
  let pathHash = 0
  for (const character of normalizePath(path)) pathHash = (pathHash * 31 + character.charCodeAt(0)) >>> 0
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return pathInsideRoot(`Assets/Runas DM Backups/${filename}-${pathHash.toString(36)}-${stamp}.md`, rootFolder)
}

/**
 * Excluir uma página no site precisa excluir a nota correspondente no vault;
 * senão, a próxima sincronização encontra o arquivo intacto e a reimporta
 * como se fosse nova. Uma cópia vai antes para `Assets/Runas DM Backups`,
 * como já acontece ao sobrescrever uma nota divergente.
 */
export async function deleteVaultNote(page: KnowledgePage, adapter: VaultAdapter, rootFolder: string): Promise<void> {
  if (!page.obsidianPath || !adapter.deleteFile) return
  let markdown = page.obsidianSourceMarkdown
  try {
    markdown = (await adapter.readNote(page.obsidianPath)).markdown
  } catch { /* o arquivo já pode ter sido removido fora do site; usa a última cópia conhecida */ }
  if (markdown) await adapter.writeText(backupPath(page.obsidianPath, rootFolder), markdown).catch(() => undefined)
  await adapter.deleteFile(page.obsidianPath)
}

/**
 * A nota-hub "<Nome> (Campanha)" pode nunca ter sido rastreada como uma
 * página vinculada (ex.: se a campanha já estava excluída localmente na
 * primeira vez que ela foi lida). Sem apagá-la também, seu título sozinho
 * basta para `ensureCampaign` recriar a campanha na sincronização seguinte.
 */
export async function deleteCampaignHubNotes(campaignTitle: string, adapter: VaultAdapter, rootFolder: string): Promise<number> {
  if (!adapter.deleteFile) return 0
  const paths = await adapter.listMarkdownFiles(rootFolder)
  let deleted = 0
  for (const path of paths) {
    const filename = path.split("/").pop()?.replace(/\.md$/i, "") ?? ""
    const match = filename.match(/^(.+?)\s*\(Campanha\)$/i)
    if (!match || !campaignTitleMatches(campaignTitle, match[1].trim())) continue
    const note = await adapter.readNote(path).catch(() => null)
    if (note) await adapter.writeText(backupPath(path, rootFolder), note.markdown).catch(() => undefined)
    await adapter.deleteFile(path)
    deleted += 1
  }
  return deleted
}

function collisionPath(path: string, page: KnowledgePage): string {
  return path.replace(/\.md$/i, ` (${page.id.slice(-8)}).md`)
}

/** Só reorganiza notas que o próprio Runas DM já gravou; nunca move conteúdo nativo do usuário. */
function isManagedByRunasDm(page: KnowledgePage): boolean {
  return /^runas_id:/m.test(page.obsidianSourceMarkdown)
}

export async function synchronizeWorkspaceWithVault(stateValue: KnowledgeWorkspaceState, adapter: VaultAdapter, rootFolder = "", onProgress?: (done: number, total: number) => void, priority: VaultSyncPriority = "obsidian"): Promise<VaultSyncResult> {
  const paths = await adapter.listMarkdownFiles(rootFolder)
  const notes = await Promise.all(paths.map((path) => adapter.readNote(path)))
  const merged = mergeObsidianNotes(stateValue, notes)
  // Ao salvar pelo site, a edição que acabou de ser confirmada no formulário
  // vence um conflito antigo do vault. A leitura continua acontecendo para
  // importar páginas novas e manter a sincronização bidirecional.
  if (priority === "site") {
    const preferred = new Map(stateValue.pages.map((page) => [page.id, page]))
    merged.state = {
      ...merged.state,
      pages: merged.state.pages.map((page) => preferred.get(page.id) ?? page),
    }
  }
  let state = await cacheEmbeddedVaultImages(merged.state, adapter, rootFolder)
  const baseFiles = adapter.listBaseFiles ? await adapter.listBaseFiles(rootFolder).catch(() => []) : []
  const useVaultOrganization = baseFiles.length > 0
  const existingByPath = new Map(notes.map((note) => [normalizedLabel(note.path), note]))
  let exported = 0
  let backups = 0
  let done = 0
  for (const originalPage of state.pages) {
    const unchangedSinceLastSync = Boolean(originalPage.obsidianSourceMarkdown)
      && originalPage.obsidianFingerprint === pageObsidianFingerprint(originalPage, state)
    const page = unchangedSinceLastSync ? originalPage : await pageWithVaultAttachments(originalPage, adapter, rootFolder)
    let path = useVaultOrganization ? organizedObsidianPathForPage(page, state, rootFolder) : obsidianPathForPage(page, state, rootFolder)
    // Reorganiza retroativamente páginas de campanha que o próprio Runas DM já
    // gravou fora da estrutura por .base (ex.: direto na raiz, de antes de o
    // vault ter arquivos .base). Nunca move notas nativas do usuário (sem
    // `runas_id`) nem sobrescreve um caminho já ocupado por outra nota.
    let previousPath = ""
    if (useVaultOrganization && page.scope === "campaign" && originalPage.obsidianPath && isManagedByRunasDm(originalPage)) {
      const organized = organizedObsidianPathForPage({ ...page, obsidianPath: "" }, state, rootFolder)
      if (normalizedLabel(organized) !== normalizedLabel(originalPage.obsidianPath) && !existingByPath.has(normalizedLabel(organized))) {
        previousPath = originalPage.obsidianPath
        path = organized
      }
    }
    let existing = existingByPath.get(normalizedLabel(path))
    if (existing && !originalPage.obsidianPath) {
      const existingId = text((existing.frontmatter ?? parseMarkdownFrontmatter(existing.markdown).frontmatter).runas_id)
      if (existingId !== page.id) { path = collisionPath(path, page); existing = existingByPath.get(normalizedLabel(path)) }
    }
    // Uma nota apenas importada deve permanecer byte a byte intacta. Assim,
    // propriedades particulares do Obsidian que o site não conhece não somem.
    const desired = unchangedSinceLastSync && originalPage.obsidianSourceMarkdown
      ? originalPage.obsidianSourceMarkdown
      : pageToMarkdown(page, state)
    if (existing?.markdown !== desired) {
      if (existing) { await adapter.writeText(backupPath(path, rootFolder), existing.markdown); backups += 1 }
      await adapter.writeText(path, desired)
      exported += 1
    }
    if (previousPath) {
      if (adapter.deleteFile) await adapter.deleteFile(previousPath).catch(() => undefined)
      existingByPath.delete(normalizedLabel(previousPath))
    }
    existingByPath.set(normalizedLabel(path), { path, markdown: desired, createdAt: originalPage.createdAt, modifiedAt: Date.now() })
    const syncedAt = Date.now()
    state = { ...state, pages: state.pages.map((candidate) => candidate.id === originalPage.id ? { ...candidate, obsidianPath: path, obsidianSourceMarkdown: desired, obsidianModifiedAt: syncedAt, obsidianFingerprint: pageObsidianFingerprint(candidate, state) } : candidate) }
    done += 1
    onProgress?.(done, state.pages.length)
  }
  state.updatedAt = Date.now()
  return { state, imported: merged.imported, exported, backups }
}
