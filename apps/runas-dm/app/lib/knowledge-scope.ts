import type { KnowledgePage, KnowledgeWorkspaceState } from "./knowledge-model"
import { isSynchronizableVaultPath } from "./obsidian-sync"
import type { SnapshotStats } from "./snapshot-policy"
import type { UiPreferences } from "./ui-preferences"
import type { VaultSaveInput } from "./vault-data"

/**
 * O que pode sair do dispositivo (nuvem e arquivos de dados do vault): somente
 * Bestiário, Campanhas e Wiki. Duas regras vivem aqui:
 *
 * - páginas rastreadas em pastas que não são da Wiki nem de Campanhas (Livro
 *   Vermelho, arquivo morto…) nunca entram: são resíduo de importações antigas;
 * - um dispositivo "virgem" (sem dado algum do mestre) nunca vira backup, para
 *   que um computador novo jamais substitua uma cópia boa por um estado vazio.
 */

export function pageBelongsToWorkspace(page: Pick<KnowledgePage, "obsidianPath">): boolean {
  return !page.obsidianPath || isSynchronizableVaultPath(page.obsidianPath)
}

export function knowledgeSnapshotForStorage(state: KnowledgeWorkspaceState): KnowledgeWorkspaceState {
  const pages = state.pages.filter(pageBelongsToWorkspace)
  return pages.length === state.pages.length ? state : { ...state, pages }
}

/** Sem páginas, campanhas, tags, eras nem exclusões: nada do mestre ainda vive neste dispositivo. */
export function isPristineKnowledge(state: KnowledgeWorkspaceState): boolean {
  return state.pages.length === 0 && state.campaigns.length === 0 && state.tags.length === 0 && state.categories.length === 0 && (state.eras?.length ?? 0) === 0 && state.deletedIds.length === 0
}

export function knowledgeStats(state: KnowledgeWorkspaceState): SnapshotStats {
  const pages = state.pages.length
  const campaigns = state.campaigns.length
  const tags = state.tags.length
  return { total: pages + campaigns + tags, pages, campaigns, tags, eras: state.eras?.length ?? 0 }
}

/**
 * Texto que muda quando (e só quando) o conteúdo muda. Ignora as datas que a
 * sincronização com o vault reescreve a cada ciclo (`updatedAt` do espaço de
 * trabalho e `obsidianModifiedAt` de cada página): sem isso, uma aba aberta
 * reenviaria a mesma cópia à nuvem a cada 30 s.
 */
export function knowledgeSignature(state: KnowledgeWorkspaceState): string {
  return JSON.stringify(state, (key, value: unknown) => key === "updatedAt" || key === "obsidianModifiedAt" ? undefined : value)
}

/** O que o arquivo `wiki-e-campanhas.json` do vault guarda: o espaço de trabalho inteiro (só o que é do Runas DM) + as preferências de interface. */
export function knowledgeVaultInput(state: KnowledgeWorkspaceState, preferences: UiPreferences): VaultSaveInput {
  const snapshot = knowledgeSnapshotForStorage(state)
  return { data: snapshot, signature: knowledgeSignature(snapshot), counts: knowledgeStats(snapshot), preferences, pristine: isPristineKnowledge(snapshot) }
}
