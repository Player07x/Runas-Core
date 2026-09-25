/**
 * Política comum a todo lugar onde o Runas DM guarda uma cópia inteira dos
 * dados (backup na nuvem e arquivos de dados dentro do vault do Obsidian).
 *
 * As regras nascem de um acidente real: um dispositivo novo, com o estado
 * vazio, enviou "o estado local" por cima do backup bom e ninguém percebeu.
 * Por isso uma gravação só pode substituir uma cópia existente quando
 * (1) o dispositivo conhece a versão que está substituindo e (2) o resultado
 * não encolhe de forma suspeita. E, mesmo quando pode, a versão anterior é
 * preservada de tempos em tempos (checkpoint) para que nada seja definitivo.
 */

/** Contagens usadas só para comparar tamanhos; `total` é a soma dos registros que importam. */
export interface SnapshotStats {
  total: number
  [key: string]: number
}

/** Abaixo desta fração do total atual (e com o atual a partir do mínimo) a gravação é tratada como acidente. */
export const SHRINK_RATIO = 0.6
export const SHRINK_MIN_HEAD_TOTAL = 10

export interface CheckpointPolicy {
  /** Distância mínima entre dois checkpoints. */
  intervalMs: number
  /** Quantos checkpoints (fora a versão atual) são mantidos. */
  keep: number
}

/** Nuvem: cabeça + até 10 versões antigas, uma a cada 6 h de atividade. */
export const CLOUD_CHECKPOINT_POLICY: CheckpointPolicy = { intervalMs: 6 * 60 * 60 * 1000, keep: 10 }
/** Vault, Campanhas/Wiki: 5 cópias, uma a cada 6 h. */
export const VAULT_KNOWLEDGE_CHECKPOINT_POLICY: CheckpointPolicy = { intervalMs: 6 * 60 * 60 * 1000, keep: 5 }
/** Vault, Bestiário: arquivo grande (imagens), então poucas cópias e mais espaçadas. */
export const VAULT_BESTIARY_CHECKPOINT_POLICY: CheckpointPolicy = { intervalMs: 24 * 60 * 60 * 1000, keep: 2 }

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

/**
 * `true` quando gravar `next` no lugar de `head` apagaria dados demais para
 * ser uma edição normal: esvaziar uma cópia que tinha conteúdo, ou cair abaixo
 * de 60 % do total anterior. Sem estatísticas dos dois lados não há como
 * julgar, então nunca bloqueia.
 */
export function isShrink(head: SnapshotStats | null | undefined, next: SnapshotStats | null | undefined): boolean {
  if (!head || !next || !isCount(head.total) || !isCount(next.total)) return false
  if (head.total > 0 && next.total === 0) return true
  return head.total >= SHRINK_MIN_HEAD_TOTAL && next.total < head.total * SHRINK_RATIO
}

/**
 * A versão que está prestes a ser substituída deve ser guardada? Sempre quando
 * a gravação é forçada ou encolhe; caso contrário, uma vez a cada
 * `intervalMs` de distância do último checkpoint (ou se ainda não há nenhum).
 */
export function shouldCheckpoint(input: { previousAt: number; newestCheckpointAt: number | null; forced: boolean; shrink: boolean; policy: CheckpointPolicy }): boolean {
  if (input.forced || input.shrink) return true
  if (input.newestCheckpointAt === null) return true
  return input.previousAt - input.newestCheckpointAt >= input.policy.intervalMs
}

/** Checkpoints além do limite, começando pelos mais antigos. */
export function checkpointsToDrop<T extends { at: number }>(checkpoints: readonly T[], keep: number): T[] {
  return [...checkpoints].sort((left, right) => right.at - left.at).slice(Math.max(0, keep))
}

/** Lê `{"total": n, ...}` de um texto vindo de fora (cabeçalho HTTP, JSON de arquivo); qualquer coisa inválida vira `null`. */
export function parseSnapshotStats(value: unknown): SnapshotStats | null {
  let source: unknown = value
  if (typeof source === "string") {
    try { source = JSON.parse(source) } catch { return null }
  }
  if (!source || typeof source !== "object") return null
  const record = source as Record<string, unknown>
  if (!isCount(record.total)) return null
  const stats: SnapshotStats = { total: Math.trunc(record.total) }
  for (const [key, count] of Object.entries(record)) {
    if (key !== "total" && isCount(count)) stats[key] = Math.trunc(count)
  }
  return stats
}

/** Resumo legível de uma cópia para diálogos e status ("812 páginas · 3 campanhas · 40 tags"). */
export function describeStats(stats: SnapshotStats | null | undefined): string {
  if (!stats) return "conteúdo desconhecido"
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  const parts: string[] = []
  if (typeof stats.pages === "number") parts.push(plural(stats.pages, "página", "páginas"))
  if (typeof stats.campaigns === "number") parts.push(plural(stats.campaigns, "campanha", "campanhas"))
  if (typeof stats.tags === "number") parts.push(plural(stats.tags, "tag", "tags"))
  if (typeof stats.entries === "number") parts.push(plural(stats.entries, "ficha", "fichas"))
  return parts.length ? parts.join(" · ") : plural(stats.total, "registro", "registros")
}

/** Hash curto (FNV-1a, 32 bits) para comparar conteúdos sem guardá-los; não é criptográfico. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${hash.toString(16).padStart(8, "0")}:${text.length.toString(36)}`
}
