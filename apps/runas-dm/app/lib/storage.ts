import { DEFAULT_BESTIARY_COLLECTION_ID, type RunasDmState } from "./model"

const DATABASE_NAME = "runas-dm"
const STORE_NAME = "workspace"
/** Chave usada antes de bestiários múltiplos existirem; nunca é apagada por esta migração. */
const LEGACY_KEY = "primary"

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getEntry(database: IDBDatabase, key: string): Promise<RunasDmState | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly")
    const request = transaction.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve((request.result as RunasDmState | undefined) ?? null)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
  })
}

function putEntry(database: IDBDatabase, key: string, state: RunasDmState): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).put(state, key)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

/**
 * Um bestiário novo mora na sua própria chave (`collectionId`). O bestiário
 * que já existia antes de bestiários múltiplos continua acessível pela chave
 * antiga `"primary"`: na primeira leitura da coleção padrão sem dado ainda
 * migrado, o blob de `"primary"` é copiado para lá — sem apagar `"primary"`,
 * só descontinuando seu uso. Nenhum dado desaparece nessa transição.
 */
async function migrateLegacyPrimaryBestiary(): Promise<RunasDmState | null> {
  const legacy = await getEntry(await openDatabase(), LEGACY_KEY)
  if (!legacy) return null
  const migrated: RunasDmState = { ...legacy, collectionId: DEFAULT_BESTIARY_COLLECTION_ID }
  await putEntry(await openDatabase(), DEFAULT_BESTIARY_COLLECTION_ID, migrated)
  return migrated
}

export async function loadLocalState(collectionId: string = DEFAULT_BESTIARY_COLLECTION_ID): Promise<RunasDmState | null> {
  const stored = await getEntry(await openDatabase(), collectionId)
  if (stored) return stored
  if (collectionId !== DEFAULT_BESTIARY_COLLECTION_ID) return null
  return migrateLegacyPrimaryBestiary()
}

export async function saveLocalState(state: RunasDmState): Promise<void> {
  await putEntry(await openDatabase(), state.collectionId || DEFAULT_BESTIARY_COLLECTION_ID, state)
}
