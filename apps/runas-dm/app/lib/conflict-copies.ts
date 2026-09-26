import type { KnowledgePage, KnowledgeWorkspaceState } from "./knowledge-model"

/**
 * "Cópia local em conflito": o site guarda a versão local quando a mesma página mudou nos dois lados (site e vault).
 * Elas se acumulam, então há uma ação para removê-las de uma vez.
 */
export function isConflictCopy(page: Pick<KnowledgePage, "id" | "title">): boolean {
  return /\((?:cópia|copia) local em conflito\)\s*$/i.test(page.title) || page.id.startsWith("page-conflict")
}

export function conflictCopies(pages: KnowledgePage[]): KnowledgePage[] {
  return pages.filter(isConflictCopy)
}

/** Tira as páginas do estado como a exclusão manual: limpa as referências e grava a lápide, para um backup antigo não as devolver. */
export function removePagesById(state: KnowledgeWorkspaceState, ids: Iterable<string>): KnowledgeWorkspaceState {
  const removed = new Set(ids)
  if (removed.size === 0) return state
  return {
    ...state,
    pages: state.pages.filter((page) => !removed.has(page.id)).map((page) => ({
      ...page,
      linkedPageIds: page.linkedPageIds.filter((id) => !removed.has(id)),
      storyEventIds: page.storyEventIds.filter((id) => !removed.has(id)),
    })),
    campaigns: state.campaigns.map((campaign) => ({
      ...campaign,
      worldPageIds: campaign.worldPageIds.filter((id) => !removed.has(id)),
      ...(campaign.storyIds ? { storyIds: campaign.storyIds.filter((id) => !removed.has(id)) } : {}),
    })),
    deletedIds: [...new Set([...state.deletedIds, ...removed])],
  }
}
