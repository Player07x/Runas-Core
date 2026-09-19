import { CHARACTER_VERSION, type Character, type CharacterAbility, type CharacterInventoryItem, type CharacterSpell } from "@runas/core/types/character"
import { normalizeAbilities, normalizeInventory, normalizeSpells } from "@runas/core/lib/characterStorage"

export type BookEntryKind = "rule" | "character"
export type BookResourceKind = "item" | "ability" | "spell"
export type BookResourceEntity = CharacterInventoryItem | CharacterAbility | CharacterSpell

export interface BookResource {
  id: string
  kind: BookResourceKind
  entity: BookResourceEntity
}

export interface BookEntry {
  id: string
  title: string
  kind: BookEntryKind
  summary: string
  content: string
  chapterId: string
  tags: string[]
  sourcePage?: number
  sourceFile?: string
  entity: Character | null
  resources: BookResource[]
  updatedAt: number
}

export interface BookChapter {
  id: string
  title: string
  summary: string
  bookId: string
  order: number
  entries: BookEntry[]
}

export interface BookCustomPage {
  id: string
  title: string
  order: number
  content: string
  updatedAt: number
}

export interface BookRecord {
  id: string
  title: string
  subtitle: string
  accent: string
  /** Nome exibido na capa gerada automaticamente e nos metadados da exportação. */
  author: string
  /** Imagem de capa enviada pelo DM; sem ela, a exportação gera uma capa a partir de `accent`. */
  coverImageDataUrl?: string
  sourceFile: string
  chapters: BookChapter[]
  /** Páginas livres do DM (texto, imagem, tabela) inseridas entre o sumário e os capítulos na exportação. */
  customPages: BookCustomPage[]
}

export interface BookWorkspace {
  version: 1
  books: BookRecord[]
  selectedBookId: string | null
  updatedAt: number
}

export const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

const BULLET_LINE = /^[-•*]\s+(.*)$/
const NUMBERED_LINE = /^\d+[.)]\s+(.*)$/
const WIKILINK_SOURCE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

/** Converte `[[Página]]`/`[[Página|Rótulo]]` já escapados em HTML em âncoras reais, no mesmo formato que o editor produz ao digitar. */
function wikilinksToAnchors(escaped: string): string {
  return escaped.replace(WIKILINK_SOURCE, (_match, target: string, label: string | undefined) => {
    const cleanTarget = target.trim()
    const cleanLabel = (label ?? target).trim()
    return `<a data-wiki-title="${cleanTarget}">${cleanLabel}</a>`
  })
}

/**
 * Converte texto simples em HTML seguro (sem depender de `DOMParser`, para também funcionar durante o build
 * estático): parágrafos separados por linha em branco viram `<p>`, blocos onde toda linha começa com marcador
 * de lista viram `<ul>/<ol>`, e `[[wikilinks]]` no estilo antigo viram âncoras reais.
 */
export function plainBlockToHtml(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ""
  const parts: string[] = []
  for (const paragraph of trimmed.split(/\n{2,}/)) {
    const lines = paragraph.split(/\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length === 0) continue
    const isBulletBlock = lines.every((line) => BULLET_LINE.test(line))
    const isNumberedBlock = !isBulletBlock && lines.every((line) => NUMBERED_LINE.test(line))
    if (isBulletBlock || isNumberedBlock) {
      const marker = isBulletBlock ? BULLET_LINE : NUMBERED_LINE
      const items = lines.map((line) => `<li>${wikilinksToAnchors(escapeHtml(line.replace(marker, "$1")))}</li>`).join("")
      parts.push(isBulletBlock ? `<ul>${items}</ul>` : `<ol>${items}</ol>`)
    } else {
      parts.push(`<p>${lines.map((line) => wikilinksToAnchors(escapeHtml(line))).join("<br>")}</p>`)
    }
  }
  return parts.join("")
}

const HTML_BLOCK_TAG = /<(p|div|h1|h2|h3|ul|ol|blockquote|table|img)[\s>]/i

/** Detecta se o conteúdo salvo já é o HTML produzido pelo editor de texto rico, em vez de texto legado. */
function looksLikeHtml(value: string): boolean {
  return HTML_BLOCK_TAG.test(value)
}

/** Migra um `content` salvo (HTML novo ou texto legado) para o formato HTML esperado pelo editor/leitura. */
export function migrateContentHtml(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return ""
  return looksLikeHtml(value) ? value : plainBlockToHtml(value)
}

/** Extrai texto simples de um HTML já sanitizado, só para indexação de busca (sem depender de `DOMParser`). */
export function plainTextFromHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim()
}

export function createResourceEntity(kind: BookResourceKind, title: string): BookResourceEntity {
  if (kind === "item") {
    return { id: makeId("item"), usage: "stored", name: title, type: "other", affinity: 0, bondPoints: 0, baseWeight: 0, size: 0, mt: 0, quantity: 1, applyScaleWeight: false, damage: "", rdf: 0, rdm: 0, equippedAsArmor: false, prCurrent: null, prMaximum: null, enchantmentSpellId: "", bondId: "", bondAbilityId: "", skillId: "", description: "" }
  }
  if (kind === "spell") {
    return { id: makeId("spell"), category: "Arcana", name: title, description: "", costType: "pe", costMode: "fixed", costValue: 1, costText: "1 PE", magicType: "spell", rangeType: "personal", rangeText: "", area: "", duration: "", castingSkill: "" }
  }
  return { id: makeId("ability"), category: "Geral", name: title, description: "", permanentModifiers: "", costType: "none", costMode: "fixed", costValue: 0, costText: "" }
}

export function createResource(kind: BookResourceKind, title: string): BookResource {
  return { id: makeId("resource"), kind, entity: createResourceEntity(kind, title) }
}

function migrateResource(raw: unknown, fallbackId: string): BookResource | null {
  if (!raw || typeof raw !== "object") return null
  const candidate = raw as Partial<BookResource>
  if (candidate.kind !== "item" && candidate.kind !== "ability" && candidate.kind !== "spell") return null
  const entity = candidate.kind === "item"
    ? normalizeInventory([candidate.entity as CharacterInventoryItem], CHARACTER_VERSION)[0]
    : candidate.kind === "spell"
      ? normalizeSpells([candidate.entity as CharacterSpell])[0]
      : normalizeAbilities([candidate.entity as CharacterAbility])[0]
  if (!entity) return null
  return { id: typeof candidate.id === "string" && candidate.id ? candidate.id : fallbackId, kind: candidate.kind, entity }
}

/**
 * Normaliza uma página salva. Conteúdo vazio continua vazio aqui: o preenchimento pela fonte
 * original depende do texto completo dos livros, carregado sob demanda por `legacy-content.ts`.
 */
function migrateEntry(raw: unknown): BookEntry | null {
  if (!raw || typeof raw !== "object") return null
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.id !== "string" || typeof candidate.title !== "string" || typeof candidate.chapterId !== "string") return null
  const legacyKind = candidate.kind as string | undefined
  const isLegacyResourceKind = legacyKind === "item" || legacyKind === "ability" || legacyKind === "spell"
  const resources: BookResource[] = Array.isArray(candidate.resources)
    ? candidate.resources.map((resource, index) => migrateResource(resource, `${candidate.id}-resource-${index + 1}`)).filter((value): value is BookResource => value !== null)
    : isLegacyResourceKind && candidate.entity
      ? [migrateResource({ id: `${candidate.id}-resource`, kind: legacyKind, entity: candidate.entity }, `${candidate.id}-resource`)].filter((value): value is BookResource => value !== null)
      : []
  const sourceFile = typeof candidate.sourceFile === "string" ? candidate.sourceFile : ""
  const summary = typeof candidate.summary === "string" ? candidate.summary : ""
  const existingContent = typeof candidate.content === "string" ? candidate.content.trim() : ""
  return {
    id: candidate.id,
    chapterId: candidate.chapterId,
    title: candidate.title,
    kind: legacyKind === "character" ? "character" : "rule",
    summary,
    content: migrateContentHtml(existingContent),
    tags: Array.isArray(candidate.tags) ? candidate.tags as string[] : [],
    sourceFile: sourceFile || undefined,
    sourcePage: candidate.sourcePage as number | undefined,
    entity: legacyKind === "character" ? (candidate.entity as Character ?? null) : null,
    resources,
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(),
  }
}

function migrateCustomPage(raw: unknown, index: number): BookCustomPage | null {
  if (!raw || typeof raw !== "object") return null
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.id !== "string" || typeof candidate.title !== "string") return null
  return {
    id: candidate.id,
    title: candidate.title,
    order: typeof candidate.order === "number" ? candidate.order : index,
    content: migrateContentHtml(candidate.content),
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(),
  }
}

/** `seed` é o catálogo gerado no build; dados ausentes ou inválidos recebem uma cópia dele. */
export function normalizeWorkspace(value: unknown, seed: BookWorkspace): BookWorkspace {
  if (!value || typeof value !== "object") return structuredClone(seed)
  const candidate = value as Partial<BookWorkspace>
  if (!Array.isArray(candidate.books) || candidate.books.length === 0) return structuredClone(seed)
  const books = candidate.books.map((rawBook) => {
    const book = rawBook as BookRecord
    return {
      ...book,
      author: typeof book.author === "string" ? book.author : "",
      coverImageDataUrl: typeof book.coverImageDataUrl === "string" ? book.coverImageDataUrl : undefined,
      customPages: Array.isArray(book.customPages)
        ? book.customPages.map(migrateCustomPage).filter((value): value is BookCustomPage => value !== null)
        : [],
      chapters: (book.chapters ?? []).map((chapter) => ({
        ...chapter,
        entries: (chapter.entries ?? []).map(migrateEntry).filter((value): value is BookEntry => value !== null),
      })),
    }
  })
  return { version: 1, selectedBookId: typeof candidate.selectedBookId === "string" ? candidate.selectedBookId : null, updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(), books }
}

/** Página salva sem conteúdo, que o carregamento preenche a partir da fonte do livro. */
export interface LegacyContentRequest {
  key: string
  sourceFile: string
  title: string
  summary: string
}

function legacyContentKey(bookId: string, chapterId: string, entryId: string): string {
  return JSON.stringify([bookId, chapterId, entryId])
}

export function legacyContentRequests(workspace: BookWorkspace): LegacyContentRequest[] {
  return workspace.books.flatMap((book) => book.chapters.flatMap((chapter) => chapter.entries
    .filter((entry) => !entry.content)
    .map((entry) => ({ key: legacyContentKey(book.id, chapter.id, entry.id), sourceFile: entry.sourceFile ?? "", title: entry.title, summary: entry.summary }))))
}

/** Aplica o conteúdo resolvido somente às páginas que continuam vazias, preservando edições feitas nesse intervalo. */
export function applyLegacyContent(workspace: BookWorkspace, contents: Map<string, string>): BookWorkspace {
  let changed = false
  const books = workspace.books.map((book) => {
    let bookChanged = false
    const chapters = book.chapters.map((chapter) => {
      let chapterChanged = false
      const entries = chapter.entries.map((entry) => {
        const content = contents.get(legacyContentKey(book.id, chapter.id, entry.id))
        if (!content || entry.content) return entry
        chapterChanged = true
        return { ...entry, content }
      })
      if (!chapterChanged) return chapter
      bookChanged = true
      return { ...chapter, entries }
    })
    if (!bookChanged) return book
    changed = true
    return { ...book, chapters }
  })
  return changed ? { ...workspace, books } : workspace
}

export function createCustomPage(order: number): BookCustomPage {
  return { id: makeId("custom"), title: "Nova página", order, content: "", updatedAt: Date.now() }
}

export function slugify(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "pagina"
}

export function kindLabel(kind: BookEntryKind): string {
  return kind === "character" ? "Ficha" : "Regra"
}

export function resourceKindLabel(kind: BookResourceKind): string {
  return { item: "Item", ability: "Habilidade", spell: "Magia" }[kind]
}

export function findEntry(book: BookRecord, entryId: string): { chapter: BookChapter; entry: BookEntry } | null {
  for (const chapter of book.chapters) {
    const entry = chapter.entries.find((item) => item.id === entryId)
    if (entry) return { chapter, entry }
  }
  return null
}

export function allEntries(book: BookRecord): BookEntry[] {
  return book.chapters.flatMap((chapter) => chapter.entries)
}

/** Índice normalizado título → página, para resolver [[wikilinks]] dentro do mesmo livro. */
export function buildPageIndex(book: BookRecord): Map<string, BookEntry> {
  const index = new Map<string, BookEntry>()
  for (const entry of allEntries(book)) index.set(normalizeLinkTarget(entry.title), entry)
  return index
}

export function normalizeLinkTarget(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}
