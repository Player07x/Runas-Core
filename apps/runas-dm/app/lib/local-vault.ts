import { deleteCampaignHubNotes, deleteVaultNote, isSynchronizableRootFolder, WIKI_VAULT_FOLDERS, parseMarkdownFrontmatter, synchronizeWorkspaceWithVault, type VaultAdapter, type VaultSyncPriority, type VaultSyncResult } from "./obsidian-sync"
import type { KnowledgePage, KnowledgeWorkspaceState } from "./knowledge-model"
import { getDeviceId } from "./cloud-backup"
import { inspectVaultData, knownRevisionOf, loadVaultData, saveVaultData, type KnownRevision, type VaultDataAdapter, type VaultDataHeader, type VaultDataKind, type VaultInspection, type VaultLoadResult, type VaultSaveInput, type VaultSaveOutcome } from "./vault-data"

/**
 * Cada wiki (`collectionId`) tem seu próprio vault conectado neste
 * dispositivo — nunca um vault só, compartilhado entre todas. A coleção
 * padrão (a wiki que já existia antes de wikis múltiplas existirem) mantém
 * a chave antiga (`"selected-vault"`), sem `collectionId` nenhum: nenhum
 * dispositivo já conectado perde o vault ao atualizar.
 */

const DATABASE_NAME = "runas-dm-local-vault"
const STORE_NAME = "handles"
const LEGACY_HANDLE_KEY = "selected-vault"
/** O bestiário não tem vault próprio: usa sempre o handle da wiki ativa (decisão de produto). */
const DEFAULT_WIKI_COLLECTION_ID = "default"

function handleKey(collectionId: string): string {
  return collectionId === DEFAULT_WIKI_COLLECTION_ID ? LEGACY_HANDLE_KEY : `selected-vault.${collectionId}`
}

type PermissionStateValue = "granted" | "denied" | "prompt"
export type DirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionStateValue>
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionStateValue>
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite"; startIn?: string }) => Promise<FileSystemDirectoryHandle>
  }
}

const memoryHandles = new Map<string, DirectoryHandle>()

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

async function storeHandle(collectionId: string, handle: DirectoryHandle): Promise<void> {
  memoryHandles.set(collectionId, handle)
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).put(handle, handleKey(collectionId))
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

export async function readLocalVaultHandle(collectionId: string): Promise<DirectoryHandle | null> {
  const cached = memoryHandles.get(collectionId)
  if (cached) return cached
  if (typeof indexedDB === "undefined") return null
  const database = await openDatabase()
  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readonly")
    const request = transaction.objectStore(STORE_NAME).get(handleKey(collectionId))
    request.onsuccess = () => {
      const handle = (request.result as DirectoryHandle | undefined) ?? null
      if (handle) memoryHandles.set(collectionId, handle)
      resolve(handle)
    }
    request.onerror = () => resolve(null)
    transaction.oncomplete = () => database.close()
  })
}

export function supportsLocalVault(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function"
}

async function ensureWritePermission(handle: DirectoryHandle, request = false): Promise<boolean> {
  if (await handle.queryPermission({ mode: "readwrite" }) === "granted") return true
  return request && await handle.requestPermission({ mode: "readwrite" }) === "granted"
}

async function directoryAt(handle: DirectoryHandle, path: string, create: boolean): Promise<DirectoryHandle> {
  let current = handle
  for (const part of path.split("/").filter(Boolean)) current = await current.getDirectoryHandle(part, { create }) as DirectoryHandle
  return current
}

async function fileAt(handle: DirectoryHandle, path: string, create: boolean): Promise<FileSystemFileHandle> {
  const parts = path.split("/").filter(Boolean)
  const filename = parts.pop()
  if (!filename) throw new Error("Caminho de arquivo inválido.")
  return (await directoryAt(handle, parts.join("/"), create)).getFileHandle(filename, { create })
}

async function writeFile(handle: DirectoryHandle, path: string, content: string | Blob): Promise<void> {
  const file = await fileAt(handle, path, true)
  const writable = await file.createWritable()
  await writable.write(content)
  await writable.close()
}

async function fileExists(handle: DirectoryHandle, path: string): Promise<boolean> {
  try { await fileAt(handle, path, false); return true } catch { return false }
}

async function deleteFileAt(handle: DirectoryHandle, path: string): Promise<void> {
  const parts = path.split("/").filter(Boolean)
  const filename = parts.pop()
  if (!filename) return
  const directory = await directoryAt(handle, parts.join("/"), false)
  await directory.removeEntry(filename)
}

/** Cria somente o que estiver ausente; configura anexos sem tocar em preferências existentes. */
export async function prepareLocalVault(handle: DirectoryHandle): Promise<void> {
  if (!await ensureWritePermission(handle, true)) throw new Error("Permissão de escrita no vault não foi concedida.")
  await directoryAt(handle, "Assets", true)
  await directoryAt(handle, "Bases", true)
  for (const folder of WIKI_VAULT_FOLDERS) await directoryAt(handle, folder, true)
  await directoryAt(handle, ".obsidian", true)
  if (!await fileExists(handle, ".obsidian/app.json")) {
    await writeFile(handle, ".obsidian/app.json", JSON.stringify({ newFileLocation: "root", attachmentFolderPath: "Assets" }, null, 2))
  }
  if (!await fileExists(handle, "LEIA-ME Runas DM.md")) {
    await writeFile(handle, "LEIA-ME Runas DM.md", "---\nrunas_system: true\n---\n\n# Vault do Runas DM\n\nA Wiki usa Cronologia, História, Geografia, Personagens, Criaturas, Itens e Organizações; as campanhas ficam em `Campanhas/<Campanha>`. Personagens não tem subpastas; nas demais seções a primeira tag define a subpasta e as outras ficam no frontmatter. Anexos ficam em `Assets`, arquivos `.base` em `Bases`, documentos particulares em `Outros Documentos` e os dados do site (campanhas, estilo, tags, eras, bestiário) em `Runas DM`.\n")
  }
}

/** Abre o seletor do navegador (que também oferece “Nova pasta”) sem decidir nada ainda: nem prepara, nem associa a uma coleção. */
export async function pickVaultFolder(): Promise<DirectoryHandle> {
  if (!window.showDirectoryPicker) throw new Error("Este navegador não permite selecionar pastas. Use Chrome ou Edge.")
  return await window.showDirectoryPicker({ id: "runas-dm-vault", mode: "readwrite", startIn: "documents" }) as DirectoryHandle
}

/** Só inspeciona: não cria nada na pasta. Usado para decidir se ela está vazia antes de perguntar o que fazer. */
export async function peekLocalVaultFolder(handle: DirectoryHandle): Promise<{ name: string; empty: boolean; hasRunasDmData: boolean }> {
  const empty = Boolean((await handle.values().next()).done)
  const hasRunasDmData = !empty && await fileExists(handle, "Runas DM/wiki-e-campanhas.json")
  return { name: handle.name, empty, hasRunasDmData }
}

/** Depois de decidido a quem a pasta pertence: prepara a estrutura e a associa a esta coleção (wiki). */
export async function adoptVaultFolder(collectionId: string, handle: DirectoryHandle): Promise<void> {
  await prepareLocalVault(handle)
  await storeHandle(collectionId, handle)
}

/**
 * Fluxo de sempre, usado pelo diálogo "Obsidian" da wiki já aberta:
 * selecionar (ou criar, pelo próprio seletor) uma pasta sempre a associa à
 * coleção informada, sem perguntar nada — é o que "Selecionar existente" e
 * "Criar novo vault" já faziam antes de wikis múltiplas existirem.
 */
export async function selectLocalVault(collectionId: string): Promise<DirectoryHandle> {
  const handle = await pickVaultFolder()
  await adoptVaultFolder(collectionId, handle)
  return handle
}

async function listMarkdownFiles(handle: DirectoryHandle, path = ""): Promise<string[]> {
  const directory = path ? await directoryAt(handle, path, false) : handle
  const files: string[] = []
  for await (const entry of directory.values()) {
    // Na raiz só se desce nas pastas do Runas DM (as sete seções da Wiki, o alias legado e
    // Campanhas). Runas Book, Templates, arquivo morto, notas soltas… nunca são lidos nem tocados.
    if (!path && !(entry.kind === "directory" && isSynchronizableRootFolder(entry.name))) continue
    const childPath = [path, entry.name].filter(Boolean).join("/")
    if (entry.kind === "directory") files.push(...await listMarkdownFiles(handle, childPath))
    else if (entry.name.toLocaleLowerCase("pt-BR").endsWith(".md")) files.push(childPath)
  }
  return files
}

async function listAllFiles(handle: DirectoryHandle, path: string): Promise<string[]> {
  let directory: DirectoryHandle
  try { directory = await directoryAt(handle, path, false) } catch { return [] }
  const files: string[] = []
  for await (const entry of directory.values()) {
    const childPath = [path, entry.name].filter(Boolean).join("/")
    if (entry.kind === "directory") files.push(...await listAllFiles(handle, childPath))
    else files.push(childPath)
  }
  return files
}

/** Exportado para os testes: é ele que decide o que o site lê e onde escreve dentro do vault. */
export function createLocalVaultAdapter(handle: DirectoryHandle): VaultAdapter {
  return {
    listMarkdownFiles: () => listMarkdownFiles(handle),
    listBaseFiles: async () => (await listAllFiles(handle, "Bases")).filter((path) => path.toLocaleLowerCase("pt-BR").endsWith(".base")),
    async readNote(path) {
      const file = await (await fileAt(handle, path, false)).getFile()
      const markdown = await file.text()
      return { path, markdown, frontmatter: parseMarkdownFrontmatter(markdown).frontmatter, createdAt: file.lastModified, modifiedAt: file.lastModified }
    },
    async readBinary(path) {
      try { return await (await fileAt(handle, path, false)).getFile() } catch { return null }
    },
    listAssetFiles: () => listAllFiles(handle, "Assets"),
    writeText: (path, content) => writeFile(handle, path, content),
    writeBinary: (path, content) => writeFile(handle, path, content),
    deleteFile: (path) => deleteFileAt(handle, path),
  }
}

export async function localVaultName(collectionId: string): Promise<string> {
  return (await readLocalVaultHandle(collectionId))?.name ?? ""
}

export async function syncWorkspaceToLocalVault(collectionId: string, state: KnowledgeWorkspaceState, requestPermission = false, onProgress?: (done: number, total: number) => void, priority: VaultSyncPriority = "obsidian"): Promise<VaultSyncResult> {
  const handle = await readLocalVaultHandle(collectionId)
  if (!handle) throw new Error("Selecione ou crie uma pasta de vault primeiro.")
  if (!await ensureWritePermission(handle, requestPermission)) throw new Error("O navegador revogou a permissão de escrita no vault. Abra Obsidian > Importar e sincronizar para concedê-la de novo.")
  await prepareLocalVault(handle)
  return synchronizeWorkspaceWithVault(state, createLocalVaultAdapter(handle), "", onProgress, priority)
}

/** Sem isso, a nota apagada no site continua no vault e a próxima sincronização a traz de volta. */
export async function deletePageFromLocalVault(collectionId: string, page: KnowledgePage, requestPermission = false): Promise<void> {
  const handle = await readLocalVaultHandle(collectionId)
  if (!handle) throw new Error("Selecione ou crie uma pasta de vault primeiro.")
  if (!await ensureWritePermission(handle, requestPermission)) throw new Error("O navegador revogou a permissão de escrita no vault. Abra Obsidian > Importar e sincronizar para concedê-la de novo.")
  await deleteVaultNote(page, createLocalVaultAdapter(handle), "")
}

/** Cobre a nota-hub "<Nome> (Campanha)", que pode nunca ter sido rastreada como página vinculada à campanha. */
export async function deleteCampaignHubNotesFromLocalVault(collectionId: string, campaignTitle: string, requestPermission = false): Promise<number> {
  const handle = await readLocalVaultHandle(collectionId)
  if (!handle) throw new Error("Selecione ou crie uma pasta de vault primeiro.")
  if (!await ensureWritePermission(handle, requestPermission)) throw new Error("O navegador revogou a permissão de escrita no vault. Abra Obsidian > Importar e sincronizar para concedê-la de novo.")
  return deleteCampaignHubNotes(campaignTitle, createLocalVaultAdapter(handle), "")
}

// ---- arquivos de dados do site (Runas DM/*.json) ----

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotFoundError" || error.name === "TypeMismatchError")
}

async function fileOrNull(handle: DirectoryHandle, path: string): Promise<File | null> {
  try { return await (await fileAt(handle, path, false)).getFile() } catch (error) { if (isNotFound(error)) return null; throw error }
}

function createVaultDataAdapter(handle: DirectoryHandle): VaultDataAdapter {
  return {
    async readText(path) { const file = await fileOrNull(handle, path); return file ? file.text() : null },
    async readTextPrefix(path, bytes) { const file = await fileOrNull(handle, path); return file ? file.slice(0, bytes).text() : null },
    writeText: (path, content) => writeFile(handle, path, content),
    async remove(path) { try { await deleteFileAt(handle, path) } catch (error) { if (!isNotFound(error)) throw error } },
    async list(folder) {
      let directory: DirectoryHandle
      try { directory = await directoryAt(handle, folder, false) } catch (error) { if (isNotFound(error)) return []; throw error }
      const names: string[] = []
      for await (const entry of directory.values()) if (entry.kind === "file") names.push(entry.name)
      return names
    },
  }
}

/** Serializa as gravações entre abas do mesmo navegador (Web Locks); sem a API, segue direto. */
async function withCrossTabLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { locks?: LockManager }).locks
  return locks ? locks.request("runas-dm-vault-data", task) : task()
}

/**
 * `collectionId` entra na chave para que duas wikis diferentes, apontando em
 * momentos diferentes para pastas de mesmo nome, nunca compartilhem a
 * "revisão conhecida" uma da outra. `bestiaryId` faz o mesmo entre
 * bestiários diferentes salvos no mesmo vault (o bestiário não tem vault
 * próprio): sem ele, o segundo bestiário gravado pisaria na revisão
 * conhecida do primeiro.
 */
const knownKey = (collectionId: string, vaultName: string, kind: VaultDataKind, bestiaryId?: string) => `runas-dm.vault-data.${collectionId}.${vaultName}.${kind}${bestiaryId && bestiaryId !== "default" ? `.${bestiaryId}` : ""}`

/** A revisão do arquivo que este navegador escreveu ou leu por último, por wiki, vault e arquivo. */
export function readKnownVaultRevision(collectionId: string, vaultName: string, kind: VaultDataKind, bestiaryId?: string): KnownRevision | null {
  try {
    const raw = localStorage.getItem(knownKey(collectionId, vaultName, kind, bestiaryId))
    const value = raw ? JSON.parse(raw) as Partial<KnownRevision> : null
    return value && Number.isInteger(value.revision) && typeof value.writerId === "string" ? { revision: value.revision as number, writerId: value.writerId } : null
  } catch {
    return null
  }
}

export function writeKnownVaultRevision(collectionId: string, vaultName: string, kind: VaultDataKind, known: KnownRevision, bestiaryId?: string): void {
  try { localStorage.setItem(knownKey(collectionId, vaultName, kind, bestiaryId), JSON.stringify(known)) } catch { /* no máximo uma pergunta a mais */ }
}

export type VaultDataAccess = { status: "no-vault" } | { status: "permission" }

async function openVaultData(collectionId: string, requestPermission: boolean): Promise<{ status: "ok"; name: string; adapter: VaultDataAdapter } | VaultDataAccess> {
  const handle = await readLocalVaultHandle(collectionId)
  if (!handle) return { status: "no-vault" }
  if (!await ensureWritePermission(handle, requestPermission)) return { status: "permission" }
  return { status: "ok", name: handle.name, adapter: createVaultDataAdapter(handle) }
}

/**
 * Grava o arquivo de dados. Sem permissão de escrita ele não pede sozinho
 * (só com `requestPermission`, a partir de um clique). `bestiaryId` só se
 * aplica a `kind === "bestiary"`: identifica qual bestiário, já que ele
 * grava dentro do vault da wiki ativa em vez de ter um vault próprio.
 */
export async function saveDataToLocalVault(collectionId: string, kind: VaultDataKind, input: VaultSaveInput, options: { requestPermission?: boolean; force?: boolean; bestiaryId?: string } = {}): Promise<VaultSaveOutcome | VaultDataAccess> {
  const opened = await openVaultData(collectionId, options.requestPermission === true)
  if (opened.status !== "ok") return opened
  return withCrossTabLock(async () => {
    const outcome = await saveVaultData(opened.adapter, kind, input, { writerId: getDeviceId(), known: readKnownVaultRevision(collectionId, opened.name, kind, options.bestiaryId), force: options.force }, options.bestiaryId)
    if (outcome.status === "saved" || outcome.status === "unchanged") writeKnownVaultRevision(collectionId, opened.name, kind, outcome.known, options.bestiaryId)
    return outcome
  })
}

export async function inspectLocalVaultData(collectionId: string, kind: VaultDataKind, options: { requestPermission?: boolean; bestiaryId?: string } = {}): Promise<VaultInspection | VaultDataAccess> {
  const opened = await openVaultData(collectionId, options.requestPermission === true)
  if (opened.status !== "ok") return opened
  return inspectVaultData(opened.adapter, kind, readKnownVaultRevision(collectionId, opened.name, kind, options.bestiaryId), options.bestiaryId)
}

export async function loadDataFromLocalVault<T = unknown>(collectionId: string, kind: VaultDataKind, options: { requestPermission?: boolean; bestiaryId?: string } = {}): Promise<VaultLoadResult<T> | VaultDataAccess> {
  const opened = await openVaultData(collectionId, options.requestPermission === true)
  if (opened.status !== "ok") return opened
  return loadVaultData<T>(opened.adapter, kind, options.bestiaryId)
}

/** Depois de aplicar um arquivo neste dispositivo, a revisão dele passa a ser "conhecida": as próximas gravações continuam dele, sem conflito. */
export async function adoptVaultDataRevision(collectionId: string, kind: VaultDataKind, header: VaultDataHeader, bestiaryId?: string): Promise<void> {
  const name = await localVaultName(collectionId)
  if (name) writeKnownVaultRevision(collectionId, name, kind, knownRevisionOf(header), bestiaryId)
}
