import type { KnowledgePage, KnowledgeTag, KnowledgeWorkspaceState } from "./knowledge-model"

export const NO_CATEGORY_TAG = "Sem Categoria"
export const normalizedTagName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR")

export function pagesForTag(pages: KnowledgePage[], section: string, tag: string): KnowledgePage[] {
  const key = normalizedTagName(tag)
  return pages.filter((page) => page.scope === "wiki" && page.kind === section && (key === normalizedTagName(NO_CATEGORY_TAG) ? page.tags.length === 0 : page.tags.some((value) => normalizedTagName(value) === key)))
}

export function tagsForSection(state: KnowledgeWorkspaceState, section: string): KnowledgeTag[] {
  const used = new Map<string, KnowledgeTag>()
  for (const tag of state.tags) if (tag.pinnedIn.includes(section)) used.set(normalizedTagName(tag.name), tag)
  for (const page of state.pages.filter((item) => item.scope === "wiki" && item.kind === section)) {
    for (const name of page.tags) {
      const existing = state.tags.find((tag) => normalizedTagName(tag.name) === normalizedTagName(name))
      if (existing) used.set(normalizedTagName(existing.name), existing)
    }
  }
  return [...used.values()]
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
  const pages = state.pages.map((page) => page.kind === section ? { ...page, tags: page.tags.filter((value) => normalizedTagName(value) !== key) } : page)
  const tags = state.tags.map((tag) => tag.id === tagId ? { ...tag, pinnedIn: tag.pinnedIn.filter((scope) => scope !== section) } : tag).filter((tag) => tag.pinnedIn.length || state.pages.some((page) => page.tags.some((value) => normalizedTagName(value) === normalizedTagName(tag.name))))
  return { ...state, pages, tags }
}

