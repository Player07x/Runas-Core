import { fictionalYear, normalizeUniverseEras, withEraTags, type UniverseEra } from "./chronology"
import { createId } from "@runas/core/lib/ids"

export const CAMPAIGN_STATUSES = [
  "Sem Status",
  "Não Iniciada",
  "Em Progresso",
  "Concluída",
  "Fracassada",
  "Parcialmente Concluída",
  "Parcialmente Fracassada",
] as const

export const WIKI_SECTIONS = [
  { id: "chronology", label: "Cronologia" },
  { id: "story", label: "História" },
  { id: "geography", label: "Geografia" },
  { id: "characters", label: "Personagens" },
  { id: "creatures", label: "Criaturas" },
  { id: "items", label: "Itens" },
  { id: "organizations", label: "Organizações" },
] as const

export const CAMPAIGN_PAGE_KINDS = [
  { id: "mission", label: "Missão" },
  { id: "event", label: "Evento" },
  { id: "gm-note", label: "Nota" },
  { id: "encounter", label: "Encontro" },
] as const

export const CAMPAIGN_MAIN_SECTIONS = [
  { id: "campaign-stories", label: "História" },
  { id: "world", label: "Mundo" },
  { id: "adventure", label: "Aventura" },
  { id: "campaign-notes", label: "Notas" },
  { id: "appearance", label: "Estilo" },
  { id: "graph", label: "Gráfico" },
] as const

/**
 * `event` também existe dentro da Wiki, mas nunca como aba: um acontecimento
 * de História só é alcançado pela própria página de História que o lista. Na
 * Wiki ele se chama **Acontecimento**, para não se confundir com os Eventos
 * de campanha, que têm status e ordem de missão.
 */
export const WIKI_NESTED_KINDS = [
  { id: "event", label: "Acontecimento" },
] as const

/** O mesmo `kind` muda de nome conforme o escopo: `event` é Evento na campanha e Acontecimento na Wiki. */
export function pageKindLabel(kind: string, scope: "wiki" | "campaign"): string {
  const options: readonly { id: string; label: string }[] = scope === "wiki" ? [...WIKI_SECTIONS, ...WIKI_NESTED_KINDS] : CAMPAIGN_PAGE_KINDS
  return options.find((item) => item.id === kind)?.label
    ?? WIKI_SECTIONS.find((item) => item.id === kind)?.label
    ?? CAMPAIGN_PAGE_KINDS.find((item) => item.id === kind)?.label
    ?? kind
}

export type CampaignStatus = typeof CAMPAIGN_STATUSES[number]
export type WikiSection = typeof WIKI_SECTIONS[number]["id"]
export type CampaignPageKind = typeof CAMPAIGN_PAGE_KINDS[number]["id"]
export type CampaignMainSection = typeof CAMPAIGN_MAIN_SECTIONS[number]["id"]
export type KnowledgePageKind = WikiSection | CampaignPageKind | "fauna" | "monsters" | "session-note"

export interface CampaignRecord {
  id: string
  title: string
  description: string
  tags: string[]
  createdAt: number
  updatedAt: number
  accentColor?: string
  backgroundColor?: string
  textColor?: string
  backgroundImageDataUrl?: string
  buttonColor?: string
  boxColor?: string
  imageBlur?: number
  /** Histórias da Wiki vinculadas à campanha, na ordem escolhida pelo mestre. */
  storyIds?: string[]
  worldPageIds: string[]
  organizer?: { nodes: OrganizerNode[]; edges: OrganizerEdge[] }
}

export interface OrganizerNode { id: string; title: string; body: string; x: number; y: number; color?: string }
export interface OrganizerEdge { id: string; fromId: string; toId: string; label?: string }

export interface KnowledgeTag {
  id: string
  name: string
  icon: string
  color: string
  pinnedIn: string[]
}

export interface KnowledgeCategory {
  id: string
  scope: "wiki" | "campaign"
  campaignId: string | null
  name: string
  parentId: string | null
}

export interface EncounterCreatureReference {
  entryId: string
  name: string
  quantity: number
}

export interface KnowledgePage {
  id: string
  scope: "wiki" | "campaign"
  campaignId: string | null
  kind: KnowledgePageKind
  title: string
  summary: string
  contentHtml: string
  status: CampaignStatus
  date: string
  eraId?: string
  eventYear?: number | null
  eraStartYear?: number | null
  eraEndYear?: number | null
  eraCalendar?: "C.E." | "Logi" | string
  icon?: string
  /** Ordem narrativa para missões e eventos da campanha. */
  order?: string
  /**
   * Somente para `kind: "story"`: os eventos da história, na ordem em que o
   * mestre os organizou. É a fonte de verdade da sequência; `contentHtml` é
   * derivado dela e nunca digitado à mão.
   */
  storyEventIds: string[]
  storyViewMode?: "chronology" | "tale"
  accentColor?: string
  backgroundColor?: string
  textColor?: string
  backgroundImageDataUrl?: string
  tags: string[]
  categoryIds: string[]
  linkedPageIds: string[]
  bestiaryEntryId: string | null
  encounterCreatures: EncounterCreatureReference[]
  /** Caminho relativo ao vault usado para manter notas existentes no lugar. */
  obsidianPath: string
  /** Propriedades do frontmatter que o site não modela, preservadas ao regravar a nota. */
  obsidianExtraFrontmatter: Record<string, unknown>
  /** Cópia byte a byte do Markdown recebido no último sincronismo. */
  obsidianSourceMarkdown: string
  /** Assinatura dos campos importados, usada para detectar edições concorrentes. */
  obsidianFingerprint: string
  obsidianModifiedAt: number
  createdAt: number
  updatedAt: number
}

export interface KnowledgeWorkspaceState {
  version: 3
  eras?: UniverseEra[]
  campaigns: CampaignRecord[]
  /** @deprecated mantido apenas para ler snapshots v2; novas gravações usam tags. */
  categories: KnowledgeCategory[]
  tags: KnowledgeTag[]
  pages: KnowledgePage[]
  /**
   * IDs de campanhas/páginas excluídas pelo site. Sem essa lápide, mesclar
   * com o backup do D1 (ou reimportar uma nota do Obsidian que ainda carrega
   * o `runas_id` antigo no frontmatter) simplesmente devolvia o registro
   * excluído, já que uma ausência local não vence uma presença remota numa
   * mesclagem por união.
   */
  deletedIds: string[]
  updatedAt: number
}

export function createKnowledgeId(prefix: string): string {
  return `${prefix}-${createId()}`
}

export function createEmptyKnowledgeWorkspace(): KnowledgeWorkspaceState {
  return { version: 3, eras: normalizeUniverseEras(undefined), campaigns: [], categories: [], tags: [], pages: [], deletedIds: [], updatedAt: 0 }
}

export function createCampaign(title = "Nova campanha"): CampaignRecord {
  const now = Date.now()
  return { id: createKnowledgeId("campaign"), title, description: "", tags: [], storyIds: [], worldPageIds: [], createdAt: now, updatedAt: now, accentColor: "", backgroundColor: "", textColor: "", backgroundImageDataUrl: "" }
}

export function createKnowledgePage(scope: "wiki" | "campaign", kind: KnowledgePageKind, campaignId: string | null): KnowledgePage {
  const now = Date.now()
  return {
    id: createKnowledgeId("page"), scope, campaignId, kind,
    title: kind === "encounter" ? "Novo encontro" : kind === "story" ? "Nova história" : kind === "event" && scope === "wiki" ? "Novo acontecimento" : "Nova página", summary: "", contentHtml: "", status: "Sem Status", date: "", order: "", accentColor: "", backgroundColor: "", textColor: "", backgroundImageDataUrl: "",
    tags: [], categoryIds: [], linkedPageIds: [], bestiaryEntryId: null, encounterCreatures: [], storyEventIds: [], storyViewMode: "tale",
    obsidianPath: "", obsidianExtraFrontmatter: {}, obsidianSourceMarkdown: "", obsidianFingerprint: "", obsidianModifiedAt: 0,
    createdAt: now, updatedAt: now,
  }
}

/** Mostra as eras padrão sem gravar dez arquivos no vault antes de serem editadas. */
export function chronologyEraPages(state: Pick<KnowledgeWorkspaceState, "eras" | "pages" | "deletedIds">): KnowledgePage[] {
  const actual = state.pages.filter((page) => page.scope === "wiki" && page.kind === "chronology")
  const used = new Set<string>()
  const deleted = new Set(state.deletedIds)
  const normalizedTitle = (title: string) => title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR")
  const presets = normalizeUniverseEras(state.eras).flatMap((era) => {
    const id = `era-${era.id}`
    const saved = actual.find((page) => page.id === id || normalizedTitle(page.title) === normalizedTitle(era.name))
    if (saved) { used.add(saved.id); return [saved] }
    if (deleted.has(id)) return []
    return [{ ...createKnowledgePage("wiki", "chronology", null), id, title: era.name, summary: era.note, icon: "🕰️", eraStartYear: era.startYear, eraEndYear: era.endYear, eraCalendar: era.calendar, tags: [era.name] }]
  })
  return [...presets, ...actual.filter((page) => !used.has(page.id))]
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : []
}

export function normalizeKnowledgeWorkspace(value: unknown): KnowledgeWorkspaceState {
  if (!value || typeof value !== "object") return createEmptyKnowledgeWorkspace()
  const candidate = value as Partial<KnowledgeWorkspaceState>
  const deletedIds = [...new Set(Array.isArray(candidate.deletedIds) ? candidate.deletedIds.filter((id): id is string => typeof id === "string") : [])]
  const deleted = new Set(deletedIds)
  const campaigns = Array.isArray(candidate.campaigns) ? candidate.campaigns.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as CampaignRecord
    if (typeof record.id !== "string" || deleted.has(record.id)) return []
    const now = Date.now()
    const organizer = record.organizer && typeof record.organizer === "object" ? record.organizer as CampaignRecord["organizer"] : undefined
    const organizerNodes = organizer?.nodes?.filter((node): node is OrganizerNode => Boolean(node && typeof node.id === "string" && typeof node.title === "string" && Number.isFinite(node.x) && Number.isFinite(node.y))).map((node) => ({ ...node, body: typeof node.body === "string" ? node.body : "", color: typeof node.color === "string" ? node.color : undefined })) ?? []
    const organizerNodeIds = new Set(organizerNodes.map((node) => node.id))
    const organizerEdges = organizer?.edges?.filter((edge): edge is OrganizerEdge => Boolean(edge && typeof edge.id === "string" && organizerNodeIds.has(edge.fromId) && organizerNodeIds.has(edge.toId))).map((edge) => ({ ...edge, label: typeof edge.label === "string" ? edge.label : undefined })) ?? []
    return [{ id: record.id, title: typeof record.title === "string" ? record.title : "Campanha sem nome", description: typeof record.description === "string" ? record.description : "", tags: strings(record.tags), storyIds: strings(record.storyIds), worldPageIds: strings(record.worldPageIds), organizer: organizerNodes.length || organizerEdges.length ? { nodes: organizerNodes, edges: organizerEdges } : undefined, createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now, updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : now, accentColor: typeof record.accentColor === "string" ? record.accentColor : "", backgroundColor: typeof record.backgroundColor === "string" ? record.backgroundColor : "", textColor: typeof record.textColor === "string" ? record.textColor : "", buttonColor: typeof record.buttonColor === "string" ? record.buttonColor : "", boxColor: typeof record.boxColor === "string" ? record.boxColor : "", imageBlur: typeof record.imageBlur === "number" && Number.isFinite(record.imageBlur) ? Math.min(24, Math.max(0, record.imageBlur)) : 8, backgroundImageDataUrl: typeof record.backgroundImageDataUrl === "string" ? record.backgroundImageDataUrl : "" }]
  }) : []
  const categories = Array.isArray(candidate.categories) ? candidate.categories.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const category = item as KnowledgeCategory
    if (typeof category.id !== "string" || typeof category.name !== "string") return []
    return [{ id: category.id, scope: category.scope === "campaign" ? "campaign" as const : "wiki" as const, campaignId: typeof category.campaignId === "string" ? category.campaignId : null, name: category.name, parentId: typeof category.parentId === "string" ? category.parentId : null }]
  }) : []
  const validStatuses = new Set<string>(CAMPAIGN_STATUSES)
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const tagsByName = new Map<string, KnowledgeTag>()
  const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
  const tagKey = (name: string, pinnedIn: string[]) => `${normalized(name)}|${pinnedIn.find((scope) => scope.startsWith("campaign-notes:")) ?? "global"}`
  const stableTagId = (name: string, pinnedIn: string[]) => `tag-${tagKey(name, pinnedIn).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sem-nome"}`
  const ensureTag = (name: string, pinnedIn: string[] = []) => {
    const key = tagKey(name, pinnedIn)
    if (!normalized(name)) return
    const current = tagsByName.get(key)
    if (current) { current.pinnedIn = [...new Set([...current.pinnedIn, ...pinnedIn])]; return }
    tagsByName.set(key, { id: stableTagId(name, pinnedIn), name: name.trim(), icon: "🏷️", color: "#87909b", pinnedIn: [...new Set(pinnedIn)] })
  }
  const inputTags = Array.isArray(candidate.tags) ? candidate.tags : []
  inputTags.forEach((item) => { if (item && typeof item === "object" && typeof (item as KnowledgeTag).name === "string") { const tag = item as KnowledgeTag; const pinnedIn = strings(tag.pinnedIn); tagsByName.set(tagKey(tag.name, pinnedIn), { id: tag.id, name: tag.name, icon: tag.icon || "🏷️", color: tag.color || "#87909b", pinnedIn }) } })
  const pages: KnowledgePage[] = Array.isArray(candidate.pages) ? candidate.pages.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const page = item as KnowledgePage
    if (typeof page.id !== "string" || typeof page.kind !== "string" || deleted.has(page.id)) return []
    const now = Date.now()
    return [{
      id: page.id, scope: page.scope === "campaign" ? "campaign" as const : "wiki" as const,
      campaignId: typeof page.campaignId === "string" ? page.campaignId : null, kind: page.kind,
      title: typeof page.title === "string" ? page.title : "Página sem nome", summary: typeof page.summary === "string" ? page.summary : "",
      contentHtml: typeof page.contentHtml === "string" ? page.contentHtml : "", status: validStatuses.has(page.status) ? page.status : "Sem Status",
      date: typeof page.date === "string" ? page.date : "", eraId: typeof page.eraId === "string" ? page.eraId : "", eventYear: fictionalYear(page.eventYear), eraStartYear: fictionalYear(page.eraStartYear), eraEndYear: fictionalYear(page.eraEndYear), eraCalendar: typeof page.eraCalendar === "string" ? page.eraCalendar : "C.E.", icon: typeof page.icon === "string" ? page.icon : "🕰️", accentColor: page.kind === "chronology" && typeof page.accentColor === "string" ? page.accentColor : undefined, order: normalizeMissionOrder(page.order), backgroundImageDataUrl: typeof page.backgroundImageDataUrl === "string" ? page.backgroundImageDataUrl : "", tags: strings(page.tags), categoryIds: strings(page.categoryIds), linkedPageIds: strings(page.linkedPageIds),
      bestiaryEntryId: typeof page.bestiaryEntryId === "string" ? page.bestiaryEntryId : null,
      storyEventIds: [...new Set(strings(page.storyEventIds))], storyViewMode: page.storyViewMode === "chronology" ? "chronology" as const : "tale" as const,
      encounterCreatures: Array.isArray(page.encounterCreatures) ? page.encounterCreatures.flatMap((reference) => reference && typeof reference.entryId === "string" ? [{ entryId: reference.entryId, name: typeof reference.name === "string" ? reference.name : "Criatura", quantity: Math.max(1, Math.min(99, Math.trunc(Number(reference.quantity) || 1))) }] : []) : [],
      obsidianPath: typeof page.obsidianPath === "string" ? page.obsidianPath : "",
      obsidianExtraFrontmatter: page.obsidianExtraFrontmatter && typeof page.obsidianExtraFrontmatter === "object" ? page.obsidianExtraFrontmatter as Record<string, unknown> : {},
      obsidianSourceMarkdown: typeof page.obsidianSourceMarkdown === "string" ? page.obsidianSourceMarkdown : "",
      obsidianFingerprint: typeof page.obsidianFingerprint === "string" ? page.obsidianFingerprint : "",
      obsidianModifiedAt: Number.isFinite(page.obsidianModifiedAt) ? page.obsidianModifiedAt : 0,
      createdAt: Number.isFinite(page.createdAt) ? page.createdAt : now, updatedAt: Number.isFinite(page.updatedAt) ? page.updatedAt : now,
    }]
  }) : []
  for (const page of pages) {
    const legacyNames = page.categoryIds.flatMap((id) => { const category = categoryById.get(id); return category ? [category.name] : [] })
    const migratedKind = page.kind === "fauna" || page.kind === "monsters" ? "creatures" : page.kind === "session-note" ? "gm-note" : page.kind
    if (page.kind === "fauna") legacyNames.push("Fauna")
    if (page.kind === "monsters") legacyNames.push("Monstros")
    if (page.kind === "session-note") legacyNames.push("Sessões")
    for (const name of [...page.tags, ...legacyNames]) ensureTag(name, page.scope === "campaign" && migratedKind === "gm-note" ? [`campaign-notes:${page.campaignId}`] : [migratedKind])
    page.tags = [...new Set([...page.tags, ...legacyNames])]
    page.kind = migratedKind as KnowledgePageKind
    if (page.scope === "wiki" && page.kind === "chronology" && page.eraStartYear == null && page.eraEndYear == null && page.eventYear != null) page.kind = "event"
  }
  const eras = normalizeUniverseEras(candidate.eras)
  // Páginas de era antigas são migradas uma vez; eras padrão que ainda não
  // foram editadas são projetadas apenas na interface de Cronologia.
  if ((candidate.version ?? 2) < 3 && Array.isArray(candidate.eras)) {
    for (const era of eras) {
      const id = `era-${era.id}`
      if (!pages.some((page) => page.id === id) && !deleted.has(id)) pages.push({ ...createKnowledgePage("wiki", "chronology", null), id, title: era.name, summary: era.note, icon: "🕰️", accentColor: "", eraStartYear: era.startYear, eraEndYear: era.endYear, eraCalendar: era.calendar, tags: [era.name], createdAt: Date.now(), updatedAt: Date.now() } as KnowledgePage)
      ensureTag(era.name, ["chronology"])
    }
  }
  const eraPages = pages.filter((page) => page.scope === "wiki" && page.kind === "chronology" && (page.eraStartYear != null || page.eraEndYear != null))
  for (const era of eraPages) ensureTag(era.title, ["chronology"])
  const taggedPages = withEraTags(pages, eraPages)
  return { version: 3, eras, campaigns, categories, tags: [...tagsByName.values()], pages: taggedPages, deletedIds, updatedAt: Number.isFinite(candidate.updatedAt) ? candidate.updatedAt as number : Date.now() }
}

export function parseList(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))]
}

export function plainTextFromHtml(value: string): string {
  if (typeof DOMParser === "undefined") return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  return new DOMParser().parseFromString(value, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? ""
}

export function wikiLinkTitles(value: string): string[] {
  return [...value.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map((match) => match[1].trim()).filter(Boolean)
}

export function mergeKnowledgeWorkspaces(local: KnowledgeWorkspaceState, remote: KnowledgeWorkspaceState): KnowledgeWorkspaceState {
  // Uma exclusão só apaga localmente; sem essa lápide unida dos dois lados,
  // um backup remoto mais antigo (ou um local que ainda não sincronizou a
  // exclusão) simplesmente devolveria o registro numa mesclagem por união.
  const deletedIds = new Set([...local.deletedIds, ...remote.deletedIds])
  const mergeById = <T extends { id: string; updatedAt?: number }>(localItems: T[], remoteItems: T[]): T[] => {
    const merged = new Map<string, T>()
    for (const item of [...localItems, ...remoteItems]) {
      if (deletedIds.has(item.id)) continue
      const current = merged.get(item.id)
      if (!current || (item.updatedAt ?? remote.updatedAt) >= (current.updatedAt ?? local.updatedAt)) merged.set(item.id, item)
    }
    return [...merged.values()]
  }
  return {
    version: 3,
    eras: normalizeUniverseEras(remote.updatedAt >= local.updatedAt ? remote.eras ?? local.eras : local.eras ?? remote.eras),
    campaigns: mergeById(local.campaigns, remote.campaigns),
    categories: mergeById(local.categories, remote.categories),
    tags: mergeById(local.tags, remote.tags),
    pages: mergeById(local.pages, remote.pages),
    deletedIds: [...deletedIds],
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  }
}

export type CloudImportMode = "merge" | "replace"

/**
 * Importação manual de um backup da nuvem (nunca automática). "replace"
 * descarta o estado local por inteiro e adota o backup. "merge" reescreve
 * pelo `id` os registros que também existem no backup, cria os que só
 * existem no backup e preserva os que só existem localmente — exceto um
 * registro já apagado localmente (`local.deletedIds`), que um backup antigo
 * não deve ressuscitar.
 */
export function applyCloudBackup(local: KnowledgeWorkspaceState, rawBackup: unknown, mode: CloudImportMode): KnowledgeWorkspaceState {
  const backup = normalizeKnowledgeWorkspace(rawBackup)
  if (mode === "replace") return backup
  const deleted = new Set(local.deletedIds)
  const mergeById = <T extends { id: string }>(localItems: T[], backupItems: T[]): T[] => {
    const kept = backupItems.filter((item) => !deleted.has(item.id))
    const backupIds = new Set(kept.map((item) => item.id))
    return [...kept, ...localItems.filter((item) => !backupIds.has(item.id))]
  }
  return {
    version: 3,
    eras: normalizeUniverseEras(backup.eras ?? local.eras),
    campaigns: mergeById(local.campaigns, backup.campaigns),
    categories: mergeById(local.categories, backup.categories),
    tags: mergeById(local.tags, backup.tags),
    pages: mergeById(local.pages, backup.pages),
    deletedIds: local.deletedIds,
    updatedAt: Date.now(),
  }
}

export function normalizeMissionOrder(value: unknown): string {
  const order = String(value ?? "").trim().replace(",", ".")
  return /^\d+(?:\.\d+)?$/.test(order) ? order : ""
}

/** Derived links never enter linkedPageIds, so renumbering cannot leave stale edges. */
export function missionOrderLinks(page: KnowledgePage, pages: KnowledgePage[]): string[] {
  const order = normalizeMissionOrder(page.order)
  if (!order || page.scope !== "campaign" || page.kind !== "mission" || !page.campaignId) return []
  const stage = Number(order.split(".")[0])
  return pages.filter((candidate) => {
    const other = normalizeMissionOrder(candidate.order)
    return candidate.id !== page.id && candidate.scope === "campaign" && candidate.kind === "mission" && candidate.campaignId === page.campaignId && other && Math.abs(Number(other.split(".")[0]) - stage) === 1
  }).map((candidate) => candidate.id)
}

export function effectivePageLinks(page: KnowledgePage, pages: KnowledgePage[]): string[] {
  return [...new Set([...page.linkedPageIds, ...missionOrderLinks(page, pages)])]
}

/**
 * Cronologia e acontecimentos de História ocupam a mesma linha do tempo: os
 * dois são datados pelo calendário fictício (`eraId` + `eventYear`), e não
 * pela data real do arquivo.
 */
export function isChronologyPage(page: KnowledgePage): boolean {
  // O escopo só importa para `event`: na campanha ele é um Evento com status e
  // data real, e não pertence à linha do tempo do universo.
  return page.kind === "chronology" || (page.scope === "wiki" && page.kind === "event")
}

/** Os acontecimentos de uma história, na ordem registrada, ignorando ids já excluídos. */
export function storyEventsOf(story: KnowledgePage, pages: KnowledgePage[]): KnowledgePage[] {
  return story.storyEventIds.flatMap((id) => {
    const event = pages.find((candidate) => candidate.id === id)
    return event ? [event] : []
  })
}

/**
 * O corpo de uma história é sempre gerado: no `.md` ele aparece como a lista
 * de tópicos `- [[Evento]]`, enquanto o site exibe o conteúdo completo de
 * cada evento no lugar do link.
 */
export function storyEventsHtml(events: KnowledgePage[]): string {
  if (events.length === 0) return ""
  // A marcação precisa ser idêntica à que `markdownToHtml` produz ao reler
  // `- [[Evento]]` do vault; qualquer diferença faria a nota ser reescrita a
  // cada sincronização, sem nada ter mudado.
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
  const items = events.map((event) => {
    const title = event.title || "Evento sem nome"
    return `<li><a href="#wiki:${encodeURIComponent(title)}" data-wiki-title="${escape(title)}">${escape(title)}</a></li>`
  }).join("")
  return `<ul>${items}</ul>`
}

/** Grava a nova sequência de acontecimentos e mantém corpo e vínculos coerentes com ela. */
export function withStoryEvents(story: KnowledgePage, eventIds: string[], pages: KnowledgePage[]): KnowledgePage {
  const storyEventIds = [...new Set(eventIds)].filter((id) => pages.some((candidate) => candidate.id === id))
  const events = storyEventIds.flatMap((id) => pages.filter((candidate) => candidate.id === id))
  const removed = new Set(story.storyEventIds.filter((id) => !storyEventIds.includes(id)))
  return {
    ...story,
    storyEventIds,
    contentHtml: storyEventsHtml(events),
    linkedPageIds: [...new Set([...story.linkedPageIds.filter((id) => !removed.has(id)), ...storyEventIds])],
    updatedAt: Date.now(),
  }
}

/**
 * O corpo de uma História é derivado dos títulos dos seus acontecimentos.
 * Salvar um acontecimento por fora (pela linha do tempo, por exemplo) precisa
 * reescrever esse corpo; sem isso, a lista de tópicos manteria o título antigo
 * até a próxima mudança de sequência.
 */
export function withRefreshedStories(pages: KnowledgePage[], eventId: string): KnowledgePage[] {
  return pages.map((page) => {
    if (page.kind !== "story" || !page.storyEventIds.includes(eventId)) return page
    const refreshed = withStoryEvents(page, page.storyEventIds, pages)
    return refreshed.contentHtml === page.contentHtml ? page : refreshed
  })
}

export type PageSort = "recent" | "oldest" | "order"

export function sortKnowledgePages(pages: KnowledgePage[], sort: PageSort): KnowledgePage[] {
  const timestamp = (page: KnowledgePage) => isChronologyPage(page) ? page.eventYear ?? null : (page.date && Number.isFinite(Date.parse(page.date)) ? Date.parse(page.date) : page.createdAt)
  return [...pages].sort((a, b) => {
    if (sort === "order") {
      const left = normalizeMissionOrder(a.order), right = normalizeMissionOrder(b.order)
      if (left !== right) return left && right ? left.localeCompare(right, "pt-BR", { numeric: true }) : left ? -1 : 1
    }
    const left = timestamp(a), right = timestamp(b)
    if (left == null || right == null) return left == null && right == null ? a.id.localeCompare(b.id) : left == null ? 1 : -1
    return (sort === "oldest" ? 1 : -1) * (left - right || a.createdAt - b.createdAt) || a.id.localeCompare(b.id)
  })
}
