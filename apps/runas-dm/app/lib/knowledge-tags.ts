import type { KnowledgePage, KnowledgeTag, KnowledgeWorkspaceState } from "./knowledge-model"

export const NO_CATEGORY_TAG = "Sem Categoria"
export const normalizedTagName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR")

function belongsToSection(page: KnowledgePage, section: string): boolean {
  if (section === "campaign-notes") return page.scope === "campaign" && page.kind === "gm-note"
  if (page.scope !== "wiki") return false
  return section === "chronology" ? page.kind === "chronology" || page.kind === "event" : page.kind === section
}

export function pagesForTag(pages: KnowledgePage[], section: string, tag: string): KnowledgePage[] {
  const key = normalizedTagName(tag)
  return pages.filter((page) => belongsToSection(page, section) && (key === normalizedTagName(NO_CATEGORY_TAG) ? page.tags.length === 0 : page.tags.some((value) => normalizedTagName(value) === key)))
}

export function tagsForSection(state: KnowledgeWorkspaceState, section: string): KnowledgeTag[] {
  const used = new Map<string, KnowledgeTag>()
  for (const tag of state.tags) if (tag.pinnedIn.includes(section)) used.set(normalizedTagName(tag.name), tag)
  const eraNames = new Set(state.pages.filter((page) => page.scope === "wiki" && page.kind === "chronology" && (page.eraStartYear != null || page.eraEndYear != null)).map((page) => normalizedTagName(page.title)))
  for (const page of state.pages.filter((item) => belongsToSection(item, section))) {
    for (const name of page.tags) {
      if (section !== "chronology" && eraNames.has(normalizedTagName(name))) continue
      const existing = state.tags.find((tag) => normalizedTagName(tag.name) === normalizedTagName(name))
      if (existing) used.set(normalizedTagName(existing.name), existing)
    }
  }
  if (state.pages.some((page) => belongsToSection(page, section) && page.tags.length === 0)) used.set(normalizedTagName(NO_CATEGORY_TAG), { id: "__no-category__", name: NO_CATEGORY_TAG, icon: "", color: "#87909b", pinnedIn: [section] })
  return [...used.values()].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
}

export function tagCount(state: KnowledgeWorkspaceState, section: string, tag: string): number {
  return pagesForTag(state.pages, section, tag).length
}

export function renameTag(state: KnowledgeWorkspaceState, tagId: string, name: string, icon?: string, color?: string): KnowledgeWorkspaceState {
  const target = state.tags.find((tag) => tag.id === tagId)
  if (!target) return state
  const old = normalizedTagName(target.name)
  return { ...state, tags: state.tags.map((tag) => tag.id === tagId ? { ...tag, name: name.trim(), icon: icon ?? tag.icon, color: color ?? tag.color } : tag), pages: state.pages.map((page) => ({ ...page, tags: page.tags.map((value) => normalizedTagName(value) === old ? name.trim() : value) })) }
}

export function removeTagFromSection(state: KnowledgeWorkspaceState, tagId: string, section: string): KnowledgeWorkspaceState {
  const target = state.tags.find((tag) => tag.id === tagId)
  if (!target) return state
  const key = normalizedTagName(target.name)
  const pages = state.pages.map((page) => belongsToSection(page, section) ? { ...page, tags: page.tags.filter((value) => normalizedTagName(value) !== key) } : page)
  const tags = state.tags.map((tag) => tag.id === tagId ? { ...tag, pinnedIn: tag.pinnedIn.filter((scope) => scope !== section) } : tag).filter((tag) => tag.pinnedIn.length || pages.some((page) => page.tags.some((value) => normalizedTagName(value) === normalizedTagName(tag.name))))
  return { ...state, pages, tags }
}

/** Cria ou atualiza o registro global das tags digitadas no editor. */
export function ensureTagsForPage(state: KnowledgeWorkspaceState, page: KnowledgePage): KnowledgeWorkspaceState {
  const pinnedIn = page.scope === "campaign" ? "campaign-notes" : page.kind
  const tags = [...state.tags]
  for (const name of page.tags) {
    const key = normalizedTagName(name)
    if (!key || key === normalizedTagName(NO_CATEGORY_TAG)) continue
    const existing = tags.find((tag) => normalizedTagName(tag.name) === key)
    if (existing) {
      existing.pinnedIn = [...new Set([...existing.pinnedIn, pinnedIn])]
      continue
    }
    tags.push({ id: `tag-${key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sem-nome"}`, name: name.trim(), icon: "Tag", color: "#87909b", pinnedIn: [pinnedIn] })
  }
  return { ...state, tags }
}
