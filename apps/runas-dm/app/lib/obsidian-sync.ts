import { CAMPAIGN_PAGE_KINDS, CAMPAIGN_STATUSES, WIKI_SECTIONS, createCampaign, createKnowledgeId, normalizeKnowledgeWorkspace, wikiLinkTitles, type CampaignRecord, type KnowledgeCategory, type KnowledgePage, type KnowledgePageKind, type KnowledgeWorkspaceState } from "./knowledge-model"
import { createTextZip, downloadBlob, safeFilename } from "./export"
import { cacheVaultAsset } from "./vault-assets"
import { fictionalYear } from "./chronology"
import { normalizeMissionOrder } from "./knowledge-model"

export const WIKI_VAULT_FOLDERS = WIKI_SECTIONS.map((section) => section.label)
// Campanhas faz parte do arquivo sincronizado. Bases continua fora da
// interface, mas seus arquivos `.base` são lidos pelo adaptador para ativar a
// organização física das novas notas.
export const IGNORED_VAULT_FOLDERS = [".obsidian", ".trash", "Assets", "Bases", "Templates", "Notas", "Histórias", "Historias", "Campanhas"]
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
  return WIKI_SECTIONS.find((item) => item.id === page.kind)?.label ?? CAMPAIGN_PAGE_KINDS.find((item) => item.id === page.kind)?.label ?? page.kind
}

function normalizedLabel(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR")
}

function vaultPathIdentity(path: string): string {
  return normalizePath(path).split("/").map((part) => normalizedLabel(part) === "cronologia geral" ? "cronologia" : normalizedLabel(part)).join("/")
}

export function isIgnoredVaultPath(path: string): boolean {
  const parts = normalizePath(path).split("/")
  const sectionIndex = parts.findIndex((part) => normalizedLabel(part) === "cronologia geral" || WIKI_SECTIONS.some((section) => normalizedLabel(section.label) === normalizedLabel(part)))
  const ignoredIndex = parts.findIndex((part) => IGNORED_VAULT_FOLDERS.some((folder) => normalizedLabel(folder) === normalizedLabel(part)))
  return ignoredIndex >= 0 && (sectionIndex < 0 || ignoredIndex < sectionIndex)
}

function isSynchronizableVaultPath(path: string): boolean {
  const parts = normalizePath(path).split("/")
  const campaignIndex = parts.findIndex((part) => normalizedLabel(part) === normalizedLabel(CAMPAIGN_VAULT_FOLDER))
  return campaignIndex >= 0 || !isIgnoredVaultPath(path)
}

function kindFromValue(value: unknown, scope: "wiki" | "campaign", fallback?: KnowledgePageKind): KnowledgePageKind {
  const candidate = normalizedLabel(text(value))
  const options = scope === "wiki" ? WIKI_SECTIONS : CAMPAIGN_PAGE_KINDS
  return options.find((item) => normalizedLabel(item.id) === candidate || normalizedLabel(item.label) === candidate)?.id
    ?? fallback
    ?? (scope === "wiki" ? "chronology" : "gm-note")
}

function wikiLocation(path: string): { kind: KnowledgePageKind; category: string } | null {
  const parts = normalizePath(path).split("/")
  const index = parts.findIndex((part) => {
    const label = normalizedLabel(part)
    return label === "cronologia geral" || WIKI_SECTIONS.some((section) => normalizedLabel(section.label) === label)
  })
  if (index < 0) return null
  const folder = normalizedLabel(parts[index]) === "cronologia geral" ? "Cronologia" : parts[index]
  const section = WIKI_SECTIONS.find((candidate) => normalizedLabel(candidate.label) === normalizedLabel(folder))
  return section ? { kind: section.id, category: parts.length > index + 2 ? parts[index + 1] : "" } : null
}

/**
 * `Campanhas/<Nome da campanha>/<Tipo>/arquivo.md` é a estrutura que o próprio
 * Runas DM grava. Ao importar de volta, o segmento do nome da campanha nunca
 * deve virar "categoria" da página — ele só identifica a campanha, que já é
 * resolvida pelo frontmatter (`campanha`/`runas_campaign_id`).
 */
function campaignLocation(path: string, campaigns: CampaignRecord[] = []): { category: string } | null {
  const parts = normalizePath(path).split("/")
  const index = parts.findIndex((part) => normalizedLabel(part) === normalizedLabel(CAMPAIGN_VAULT_FOLDER))
  if (index < 0) return null
  const campaignSegment = parts[index + 1] ?? ""
  const isCampaignFolder = campaigns.some((campaign) => normalizedLabel(folderPart(campaign.title, "")) === normalizedLabel(campaignSegment))
  const category = parts[index + (isCampaignFolder ? 2 : 1)] ?? ""
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
  const categories = state.categories.filter((category) => page.categoryIds.includes(category.id)).map((category) => category.name).sort()
  const links = state.pages.filter((candidate) => page.linkedPageIds.includes(candidate.id)).map((candidate) => candidate.title).sort()
  return JSON.stringify({
    title: page.title, scope: page.scope, campaign: campaignFor(page, state.campaigns)?.title ?? "", kind: page.kind,
    summary: page.summary, contentHtml: page.contentHtml, status: page.status, date: page.date,
    tags: [...page.tags].sort(), categories, links, bestiaryEntryId: page.bestiaryEntryId,
    encounterCreatures: page.encounterCreatures,
    ...(page.order ? { order: page.order } : {}),
    ...(page.eraId ? { eraId: page.eraId } : {}),
    ...(page.eventYear != null ? { eventYear: page.eventYear } : {}),
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
  const categories = state.categories.filter((category) => page.categoryIds.includes(category.id)).map((category) => category.name)
  const linked = state.pages.filter((candidate) => page.linkedPageIds.includes(candidate.id)).map((candidate) => candidate.title)
  const frontmatter = [
    "---", "runas: true", `runas_id: ${yaml(page.id)}`, `runas_scope: ${yaml(page.scope)}`, `runas_kind: ${yaml(page.kind)}`,
    `runas_title: ${yaml(page.title)}`, `runas_summary: ${yaml(page.summary)}`, `Resumo: ${yaml(page.summary)}`, `runas_created_at: ${page.createdAt}`, `runas_updated_at: ${page.updatedAt}`,
    `tipo: ${yaml(kindLabel(page))}`, `status: ${yaml(page.status)}`,
    page.date ? `data: ${yaml(page.date)}` : "", page.date ? `Data: ${yaml(page.date)}` : "", campaign ? `campanha: ${yaml(campaign.title)}` : "",
    campaign ? `runas_campaign_id: ${yaml(campaign.id)}` : "",
    `tags: [${page.tags.map(yaml).join(", ")}]`, `categorias: [${categories.map(yaml).join(", ")}]`,
    `runas_linked_ids: [${page.linkedPageIds.map(yaml).join(", ")}]`,
    page.order ? `ordem: ${yaml(page.order)}` : "",
    page.eraId ? `runas_era: ${yaml(page.eraId)}` : "",
    page.eventYear != null ? `ano_evento: ${page.eventYear}` : "",
    page.bestiaryEntryId ? `ficha_bestiario: ${yaml(page.bestiaryEntryId)}` : "",
    ...extraFrontmatterLines(page.obsidianExtraFrontmatter), "---",
  ].filter(Boolean).join("\n")
  const relations = linked.length ? `\n\n## Páginas relacionadas\n${linked.map((title) => `- [[${title}]]`).join("\n")}` : ""
  const encounter = page.encounterCreatures.length ? `\n\n## Fichas do encontro\n${page.encounterCreatures.map((item) => `- ${item.quantity}× ${item.name} \`${item.entryId}\``).join("\n")}` : ""
  const body = page.kind === "encounter" ? "" : htmlToMarkdown(page.contentHtml)
  return `${frontmatter}\n\n# ${page.title}\n\n${page.summary ? `${page.kind === "encounter" ? "## Notas do mestre\n\n" : ""}${page.summary}\n\n` : ""}${body}${relations}${encounter}\n`
}

/** Wiki usa pasta por seção e, quando presente, a primeira categoria como subpasta. */
export function obsidianPathForPage(page: KnowledgePage, state: KnowledgeWorkspaceState, rootFolder = ""): string {
  if (page.obsidianPath) return normalizePath(page.obsidianPath)
  const filename = `${filePart(page.title, "Página sem nome")}.md`
  if (page.scope === "campaign") return pathInsideRoot(filename, rootFolder)
  const section = WIKI_SECTIONS.find((candidate) => candidate.id === page.kind)?.label ?? "Cronologia"
  const primaryCategory = state.categories.find((category) => page.categoryIds.includes(category.id) && category.scope === "wiki")
  return pathInsideRoot(joinVaultPath(section, primaryCategory ? folderPart(primaryCategory.name, "Categoria") : "", filename), rootFolder)
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
  const category = state.categories.find((item) => item.scope === "campaign" && item.campaignId === page.campaignId && page.categoryIds.includes(item.id))
  const defaultFolder = page.kind === "mission" || page.kind === "event"
    ? "Eventos e Missões"
    : page.kind === "session-note" ? "Anotações/Sessões"
      : page.kind === "encounter" ? "Encontros" : "Anotações"
  const folder = category ? folderPart(category.name, defaultFolder) : defaultFolder
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
  files.push({ name: "LEIA-ME Runas DM.md", content: "---\nrunas_system: true\n---\n\n# Arquivo Runas DM\n\nA Wiki usa as pastas Cronologia, Geografia, Personagens, Fauna, Monstros e Itens. A primeira categoria define a subpasta; categorias adicionais ficam no frontmatter. Anexos ficam em `Assets`.\n" })
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
  return body.match(/^#\s+(.+)$/m)?.[1].trim() ?? decodeURIComponent(path.split("/").pop()?.replace(/\.md$/i, "") ?? "Página sem nome")
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
  "ordem", "runas_era", "ano_evento", "ficha_bestiario",
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
  const page: KnowledgePage = {
    id: text(frontmatter.runas_id) || fallback?.id || createKnowledgeId("page"),
    scope,
    campaignId: campaign?.id ?? null,
    // Dentro das seis pastas canônicas, a localização física é a fonte de verdade.
    // Isso também corrige frontmatter antigo que tenha sido salvo como `chronology`.
    kind: location?.kind ?? kindFromValue(frontmatter.runas_kind ?? frontmatter.tipo, scope),
    title,
    summary: summary || content.split(/\n\s*\n/).find((block) => !/^\s*(#|[-*+]\s)/.test(block))?.replace(/\s+/g, " ").slice(0, 280) || "",
    contentHtml: markdownToHtml(content),
    status: statusFromValue(frontmatter.status),
    date: text(frontmatter.data ?? frontmatter.Data ?? frontmatter.date),
    order: normalizeMissionOrder(frontmatter.ordem ?? fallback?.order),
    eraId: text(frontmatter.runas_era ?? fallback?.eraId),
    eventYear: fictionalYear(frontmatter.ano_evento ?? fallback?.eventYear),
    backgroundImageDataUrl: fallback?.backgroundImageDataUrl ?? "",
    tags: stringArray(frontmatter.tags),
    categoryIds: [],
    linkedPageIds: stringArray(frontmatter.runas_linked_ids),
    bestiaryEntryId: text(frontmatter.ficha_bestiario) || null,
    encounterCreatures: fallback?.encounterCreatures ?? [],
    obsidianPath: normalizePath(note.path),
    obsidianExtraFrontmatter: extraFrontmatter(frontmatter),
    obsidianSourceMarkdown: note.markdown,
    obsidianFingerprint: "",
    obsidianModifiedAt: note.modifiedAt,
    createdAt: Number(frontmatter.runas_created_at) || fallback?.createdAt || note.createdAt,
    updatedAt: Number(frontmatter.runas_updated_at) || note.modifiedAt,
  }
  page.categoryIds = ensureCategories(state.categories, [...new Set([...stringArray(frontmatter.categorias), ...(location?.category ? [location.category] : []), ...(locationCampaign?.category && scope === "campaign" ? [locationCampaign.category] : [])])], scope, page.campaignId)
  return page
}

export function mergeObsidianNotes(localState: KnowledgeWorkspaceState, notes: VaultNote[]): { state: KnowledgeWorkspaceState; imported: number } {
  const state = normalizeKnowledgeWorkspace(structuredClone(localState))
  state.pages = state.pages.filter((page) => !page.obsidianPath || isSynchronizableVaultPath(page.obsidianPath))
  const importedPages: { pageId: string; markdown: string }[] = []
  let imported = 0
  for (const note of notes) {
    const parsed = parseMarkdownFrontmatter(note.markdown)
    const noteFrontmatter = { ...parsed.frontmatter, ...(note.frontmatter ?? {}) }
    if (noteFrontmatter.runas_system === true) continue
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
        const categoryIds = location?.category
          ? ensureCategories(state.categories, [location.category], "wiki", null)
          : []
        const retained = {
          ...existing,
          kind: location?.kind ?? existing.kind,
          categoryIds: [...new Set([...existing.categoryIds, ...categoryIds])],
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
  state.updatedAt = Math.max(state.updatedAt, ...notes.map((note) => note.modifiedAt), 0)
  return { state, imported }
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
        image.dataset.width = "75"
        image.dataset.align = "center"
        image.style.width = "75%"
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
