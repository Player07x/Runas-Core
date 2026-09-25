import { bestiaryBackupPayload } from "./backup-sync"
import { SAMPLE_ENTRY_IDS, defaultMasteryTables, type RunasDmState } from "./model"
import type { SnapshotStats } from "./snapshot-policy"
import type { VaultSaveInput } from "./vault-data"

/** Só as fichas de exemplo e as tabelas padrão: o bestiário ainda é o que veio de fábrica. */
export function isPristineBestiary(state: RunasDmState): boolean {
  const defaults = defaultMasteryTables()
  return state.entries.every((entry) => SAMPLE_ENTRY_IDS.includes(entry.id))
    && state.masteryTables.length === defaults.length
    && defaults.every((table) => state.masteryTables.some((candidate) => candidate.id === table.id && candidate.name === table.name && candidate.multiplier === table.multiplier))
}

export function bestiaryStats(state: RunasDmState): SnapshotStats {
  return { total: state.entries.length, entries: state.entries.length, tables: state.masteryTables.length }
}

/** O que o arquivo `bestiario.json` do vault guarda: fichas e tabelas (sem a Mesa), com a data do estado fora da assinatura. */
export function bestiaryVaultInput(state: RunasDmState): VaultSaveInput {
  const payload = bestiaryBackupPayload(state)
  return { data: payload, signature: JSON.stringify({ ...payload, updatedAt: 0 }), counts: bestiaryStats(state), pristine: isPristineBestiary(state) }
}
