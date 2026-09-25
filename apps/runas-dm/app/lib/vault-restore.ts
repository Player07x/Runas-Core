import { synchronizeRunasDmState } from "./backup-sync"
import { applyCloudBackup, type CloudImportMode, type KnowledgeWorkspaceState } from "./knowledge-model"
import { normalizeRunasDmState, type RunasDmState } from "./model"

/**
 * Como os dados lidos do vault entram neste dispositivo. Mesmas regras da
 * importação da nuvem (`applyCloudBackup`):
 *
 * - `pristine`: o dispositivo ainda não tem dado algum do mestre; adota o
 *   arquivo por inteiro, inclusive as exclusões (lápides) dele;
 * - `merge`: por id, o que existe nos dois lados vem do arquivo, o que só existe
 *   no arquivo é criado e o que só existe aqui é preservado;
 * - `replace`: descarta o estado local e adota o arquivo.
 */
export type VaultRestoreMode = CloudImportMode | "pristine"

export function restoreKnowledge(local: KnowledgeWorkspaceState, data: unknown, mode: VaultRestoreMode): KnowledgeWorkspaceState {
  return applyCloudBackup(local, data, mode === "merge" ? "merge" : "replace")
}

/** Fichas e tabelas vêm do arquivo; a Mesa (encontro, iniciativa, notas) é do dispositivo e nunca é tocada. */
export function restoreBestiary(local: RunasDmState, data: unknown, mode: VaultRestoreMode, now = Date.now()): RunasDmState {
  const backup = normalizeRunasDmState(data as RunasDmState)
  if (mode === "merge") return synchronizeRunasDmState(local, backup, now)
  return normalizeRunasDmState({ ...local, entries: backup.entries, masteryTables: backup.masteryTables, updatedAt: now })
}
