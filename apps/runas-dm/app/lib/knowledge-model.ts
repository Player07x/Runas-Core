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
  { id: "geography", label: "Geografia" },
  { id: "characters", label: "Personagens" },
  { id: "fauna", label: "Fauna" },
  { id: "monsters", label: "Monstros" },
  { id: "items", label: "Itens" },
] as const

export const CAMPAIGN_PAGE_KINDS = [
  { id: "mission", label: "Missão" },
  { id: "event", label: "Evento" },
  { id: "session-note", label: "Anotação de sessão" },
  { id: "gm-note", label: "Nota de mestre" },
  { id: "encounter", label: "Encontro" },
] as const

export type CampaignStatus = typeof CAMPAIGN_STATUSES[number]
export type WikiSection = typeof WIKI_SECTIONS[number]["id"]
export type CampaignPageKind = typeof CAMPAIGN_PAGE_KINDS[number]["id"]
export type KnowledgePageKind = WikiSection | CampaignPageKind

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
  /** Ordem narrativa para missões e eventos da campanha. */
  order?: string
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
  /** Cópia byte a byte do Markdown recebido no último sincronismo. */
  obsidianSourceMarkdown: string
  /** Assinatura dos campos importados, usada para detectar edições concorrentes. */
  obsidianFingerprint: string
  obsidianModifiedAt: number
  createdAt: number
  updatedAt: number
}

export interface KnowledgeWorkspaceState {
  version: 2
  campaigns: CampaignRecord[]
  categories: KnowledgeCategory[]
  pages: KnowledgePage[]
  updatedAt: number
}

export function createKnowledgeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function createEmptyKnowledgeWorkspace(): KnowledgeWorkspaceState {
  return { version: 2, campaigns: [], categories: [], pages: [], updatedAt: 0 }
}

export function createCampaign(title = "Nova campanha"): CampaignRecord {
  const now = Date.now()
  return { id: createKnowledgeId("campaign"), title, description: "", tags: [], createdAt: now, updatedAt: now, accentColor: "", backgroundColor: "", textColor: "", backgroundImageDataUrl: "" }
}

export function createKnowledgePage(scope: "wiki" | "campaign", kind: KnowledgePageKind, campaignId: string | null): KnowledgePage {
  const now = Date.now()
  return {
    id: createKnowledgeId("page"), scope, campaignId, kind,
    title: kind === "encounter" ? "Novo encontro" : "Nova página", summary: "", contentHtml: "", status: "Sem Status", date: "", order: "", accentColor: "", backgroundColor: "", textColor: "", backgroundImageDataUrl: "",
    tags: [], categoryIds: [], linkedPageIds: [], bestiaryEntryId: null, encounterCreatures: [],
    obsidianPath: "", obsidianSourceMarkdown: "", obsidianFingerprint: "", obsidianModifiedAt: 0,
    createdAt: now, updatedAt: now,
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : []
}

export function normalizeKnowledgeWorkspace(value: unknown): KnowledgeWorkspaceState {
  if (!value || typeof value !== "object") return createEmptyKnowledgeWorkspace()
  const candidate = value as Partial<KnowledgeWorkspaceState>
  const campaigns = Array.isArray(candidate.campaigns) ? candidate.campaigns.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as CampaignRecord
    if (typeof record.id !== "string") return []
    const now = Date.now()
    return [{ id: record.id, title: typeof record.title === "string" ? record.title : "Campanha sem nome", description: typeof record.description === "string" ? record.description : "", tags: strings(record.tags), createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now, updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : now, accentColor: typeof record.accentColor === "string" ? record.accentColor : "", backgroundColor: typeof record.backgroundColor === "string" ? record.backgroundColor : "", textColor: typeof record.textColor === "string" ? record.textColor : "", backgroundImageDataUrl: typeof record.backgroundImageDataUrl === "string" ? record.backgroundImageDataUrl : "" }]
  }) : []
  const categories = Array.isArray(candidate.categories) ? candidate.categories.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const category = item as KnowledgeCategory
    if (typeof category.id !== "string" || typeof category.name !== "string") return []
    return [{ id: category.id, scope: category.scope === "campaign" ? "campaign" as const : "wiki" as const, campaignId: typeof category.campaignId === "string" ? category.campaignId : null, name: category.name, parentId: typeof category.parentId === "string" ? category.parentId : null }]
  }) : []
  const validStatuses = new Set<string>(CAMPAIGN_STATUSES)
  const pages = Array.isArray(candidate.pages) ? candidate.pages.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const page = item as KnowledgePage
    if (typeof page.id !== "string" || typeof page.kind !== "string") return []
    const now = Date.now()
    return [{
      id: page.id, scope: page.scope === "campaign" ? "campaign" as const : "wiki" as const,
      campaignId: typeof page.campaignId === "string" ? page.campaignId : null, kind: page.kind,
      title: typeof page.title === "string" ? page.title : "Página sem nome", summary: typeof page.summary === "string" ? page.summary : "",
      contentHtml: typeof page.contentHtml === "string" ? page.contentHtml : "", status: validStatuses.has(page.status) ? page.status : "Sem Status",
      date: typeof page.date === "string" ? page.date : "", order: typeof page.order === "string" ? page.order : "", accentColor: typeof page.accentColor === "string" ? page.accentColor : "", backgroundColor: typeof page.backgroundColor === "string" ? page.backgroundColor : "", textColor: typeof page.textColor === "string" ? page.textColor : "", backgroundImageDataUrl: typeof page.backgroundImageDataUrl === "string" ? page.backgroundImageDataUrl : "", tags: strings(page.tags), categoryIds: strings(page.categoryIds), linkedPageIds: strings(page.linkedPageIds),
      bestiaryEntryId: typeof page.bestiaryEntryId === "string" ? page.bestiaryEntryId : null,
      encounterCreatures: Array.isArray(page.encounterCreatures) ? page.encounterCreatures.flatMap((reference) => reference && typeof reference.entryId === "string" ? [{ entryId: reference.entryId, name: typeof reference.name === "string" ? reference.name : "Criatura", quantity: Math.max(1, Math.min(99, Math.trunc(Number(reference.quantity) || 1))) }] : []) : [],
      obsidianPath: typeof page.obsidianPath === "string" ? page.obsidianPath : "",
      obsidianSourceMarkdown: typeof page.obsidianSourceMarkdown === "string" ? page.obsidianSourceMarkdown : "",
      obsidianFingerprint: typeof page.obsidianFingerprint === "string" ? page.obsidianFingerprint : "",
      obsidianModifiedAt: Number.isFinite(page.obsidianModifiedAt) ? page.obsidianModifiedAt : 0,
      createdAt: Number.isFinite(page.createdAt) ? page.createdAt : now, updatedAt: Number.isFinite(page.updatedAt) ? page.updatedAt : now,
    }]
  }) : []
  return { version: 2, campaigns, categories, pages, updatedAt: Number.isFinite(candidate.updatedAt) ? candidate.updatedAt as number : Date.now() }
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
  const mergeById = <T extends { id: string; updatedAt?: number }>(localItems: T[], remoteItems: T[]): T[] => {
    const merged = new Map<string, T>()
    for (const item of [...localItems, ...remoteItems]) {
      const current = merged.get(item.id)
      if (!current || (item.updatedAt ?? remote.updatedAt) >= (current.updatedAt ?? local.updatedAt)) merged.set(item.id, item)
    }
    return [...merged.values()]
  }
  return {
    version: 2,
    campaigns: mergeById(local.campaigns, remote.campaigns),
    categories: mergeById(local.categories, remote.categories),
    pages: mergeById(local.pages, remote.pages),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  }
}
