import { createEmptyKnowledgeWorkspace, DEFAULT_WIKI_COLLECTION_ID, normalizeKnowledgeWorkspace, type KnowledgeWorkspaceState } from "./knowledge-model"

const DATABASE_NAME = "runas-dm-knowledge"
const STORE_NAME = "workspace"
/** Chave usada antes de wikis múltiplas existirem; nunca é apagada por esta migração. */
const LEGACY_KEY = "primary"

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getEntry(database: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly")
    const request = transaction.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
  })
}

function putEntry(database: IDBDatabase, key: string, state: KnowledgeWorkspaceState): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).put(state, key)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

/**
 * Uma wiki nova mora na sua própria chave (`collectionId`). A wiki que já
 * existia antes de wikis múltiplas continua acessível pela chave antiga
 * `"primary"`: na primeira leitura da coleção padrão sem dado ainda migrado,
 * o blob de `"primary"` é copiado para lá — sem apagar `"primary"`, só
 * descontinuando seu uso. Nenhum dado desaparece nessa transição.
 */
async function migrateLegacyPrimaryWorkspace(): Promise<KnowledgeWorkspaceState | null> {
  const legacy = await getEntry(await openDatabase(), LEGACY_KEY)
  if (!legacy) return null
  const migrated = normalizeKnowledgeWorkspace({ ...(legacy as object), collectionId: DEFAULT_WIKI_COLLECTION_ID })
  await putEntry(await openDatabase(), DEFAULT_WIKI_COLLECTION_ID, migrated)
  return migrated
}

export async function loadKnowledgeWorkspace(collectionId: string = DEFAULT_WIKI_COLLECTION_ID): Promise<KnowledgeWorkspaceState> {
  const stored = await getEntry(await openDatabase(), collectionId)
  if (stored) return normalizeKnowledgeWorkspace(stored)
  if (collectionId === DEFAULT_WIKI_COLLECTION_ID) {
    const migrated = await migrateLegacyPrimaryWorkspace()
    if (migrated) return migrated
  }
  return { ...createEmptyKnowledgeWorkspace(), collectionId }
}

export async function saveKnowledgeWorkspace(state: KnowledgeWorkspaceState): Promise<void> {
  await putEntry(await openDatabase(), state.collectionId || DEFAULT_WIKI_COLLECTION_ID, state)
}
