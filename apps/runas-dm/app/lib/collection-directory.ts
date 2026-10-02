import type { RulesetId } from "@runas/ruleset-contracts"
import { fetchCloudBackup, putCloudBackup, type CloudKind } from "./cloud-backup"

/**
 * Índice, na nuvem, de quais wikis/bestiários (coleções) este mestre já
 * criou em qualquer dispositivo — não o conteúdo delas, só `{id, name}`.
 *
 * Sem isso, um dispositivo novo só enxerga a coleção `"default"`: o registro
 * de wikis/bestiários (`WikiRegistry`/`BestiaryRegistry`) é local a cada
 * navegador e nunca viaja. O diretório usa o mesmo cliente de backup
 * versionado (`cloud-backup.ts`), sob um `collectionId` reservado, então não
 * precisa de nenhuma rota nova: a coleção é só mais uma string livre para o
 * servidor, que nunca interpreta o payload.
 *
 * O diretório só cresce: nenhum dispositivo apaga a entrada de outro. "Tirar
 * do seletor" (`removeWikiCollection`/`removeBestiaryCollection`) já é,
 * propositalmente, uma ação só deste dispositivo que não apaga dado nenhum —
 * replicar essa remoção para a nuvem removeria uma wiki que outro dispositivo
 * ainda usa de verdade. A lápide local (`WikiRegistry.deletedCollectionIds`)
 * serve só para este dispositivo não reoferecer, na mesma hora, algo que ele
 * acabou de tirar do próprio seletor — nunca é enviada à nuvem.
 */

export const DIRECTORY_COLLECTION_ID = "__directory__"

export interface CollectionDirectoryEntry {
  id: string
  name: string
  updatedAt: number
  /** Só para bestiários: o sistema de regras, necessário para recriar a coleção localmente. */
  system?: RulesetId
}

export interface CollectionDirectory {
  version: 1
  collections: CollectionDirectoryEntry[]
}

const MAX_PUSH_ATTEMPTS = 3

function emptyDirectory(): CollectionDirectory {
  return { version: 1, collections: [] }
}

function sameDirectory(left: CollectionDirectory, right: CollectionDirectory): boolean {
  if (left.collections.length !== right.collections.length) return false
  const sortedLeft = [...left.collections].sort((a, b) => a.id.localeCompare(b.id))
  const sortedRight = [...right.collections].sort((a, b) => a.id.localeCompare(b.id))
  return sortedLeft.every((entry, index) => {
    const other = sortedRight[index]
    return !!other && other.id === entry.id && other.name === entry.name && other.updatedAt === entry.updatedAt && other.system === entry.system
  })
}

/** União por id, mantendo a entrada com o `updatedAt` mais recente em caso de conflito. */
function mergeDirectories(local: CollectionDirectory, remote: CollectionDirectory): CollectionDirectory {
  const byId = new Map<string, CollectionDirectoryEntry>()
  for (const entry of [...remote.collections, ...local.collections]) {
    const existing = byId.get(entry.id)
    if (!existing || entry.updatedAt >= existing.updatedAt) byId.set(entry.id, entry)
  }
  return { version: 1, collections: [...byId.values()] }
}

function normalizeDirectory(value: unknown): CollectionDirectory {
  if (!value || typeof value !== "object") return emptyDirectory()
  const candidate = value as Partial<CollectionDirectory>
  const collections = (Array.isArray(candidate.collections) ? candidate.collections : []).flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as Partial<CollectionDirectoryEntry>
    if (typeof record.id !== "string" || !record.id.trim() || typeof record.name !== "string" || !record.name.trim()) return []
    const entry: CollectionDirectoryEntry = { id: record.id, name: record.name, updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt as number : 0 }
    if (typeof record.system === "string") entry.system = record.system as RulesetId
    return [entry]
  })
  return { version: 1, collections }
}

/** Lê o diretório da nuvem; `null` em qualquer falha (sem rede, token inválido, nuvem fora do ar) — é só uma conveniência de descoberta, nunca bloqueia nada. */
export async function fetchCloudDirectory(kind: CloudKind, token: string): Promise<CollectionDirectory | null> {
  const result = await fetchCloudBackup<unknown>(kind, token, undefined, DIRECTORY_COLLECTION_ID)
  if (!result.ok) return null
  if (result.empty) return emptyDirectory()
  return normalizeDirectory(result.data)
}

/**
 * Funde o registro local com o diretório remoto e publica o resultado, melhor
 * esforço (nunca lança, nunca pede nada ao usuário).
 *
 * Um `409 stale` de outro dispositivo publicando ao mesmo tempo não é
 * reenviado automaticamente por `putCloudBackup` (só cobre a própria resposta
 * perdida) — como aqui não existe diálogo de conflito, a própria função busca
 * de novo e tenta mais algumas vezes. Um `shrink` só é possível se o servidor
 * já viu uma lista maior antes; como este payload é só um índice de
 * descoberta, nunca a wiki/bestiário em si, forçar o envio não arrisca nenhum
 * dado do mestre.
 */
export async function pushCollectionDirectory(kind: CloudKind, token: string, local: CollectionDirectory): Promise<void> {
  for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt += 1) {
    const remote = (await fetchCloudDirectory(kind, token)) ?? emptyDirectory()
    const merged = mergeDirectories(local, remote)
    if (sameDirectory(merged, remote)) return
    const stats = { total: merged.collections.length }
    const result = await putCloudBackup(kind, token, { payload: merged, stats }, DIRECTORY_COLLECTION_ID)
    if (result.ok) return
    if (result.reason === "shrink") {
      await putCloudBackup(kind, token, { payload: merged, stats, force: true }, DIRECTORY_COLLECTION_ID)
      return
    }
    if (result.reason !== "stale") return
  }
}
