import { deleteCampaignHubNotes, deleteVaultNote, isSynchronizableRootFolder, WIKI_VAULT_FOLDERS, parseMarkdownFrontmatter, synchronizeWorkspaceWithVault, type VaultAdapter, type VaultSyncPriority, type VaultSyncResult } from "./obsidian-sync"
import type { KnowledgePage, KnowledgeWorkspaceState } from "./knowledge-model"
import { getDeviceId } from "./cloud-backup"
import { inspectVaultData, knownRevisionOf, loadVaultData, saveVaultData, type KnownRevision, type VaultDataAdapter, type VaultDataHeader, type VaultDataKind, type VaultInspection, type VaultLoadResult, type VaultSaveInput, type VaultSaveOutcome } from "./vault-data"

const DATABASE_NAME = "runas-dm-local-vault"
const STORE_NAME = "handles"
const HANDLE_KEY = "selected-vault"

type PermissionStateValue = "granted" | "denied" | "prompt"
type DirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionStateValue>
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionStateValue>
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite"; startIn?: string }) => Promise<FileSystemDirectoryHandle>
  }
}

let memoryHandle: DirectoryHandle | null = null

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

async function storeHandle(handle: DirectoryHandle): Promise<void> {
  memoryHandle = handle
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
}

export async function readLocalVaultHandle(): Promise<DirectoryHandle | null> {
  if (memoryHandle) return memoryHandle
  if (typeof indexedDB === "undefined") return null
  const database = await openDatabase()
  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readonly")
    const request = transaction.objectStore(STORE_NAME).get(HANDLE_KEY)
    request.onsuccess = () => { memoryHandle = (request.result as DirectoryHandle | undefined) ?? null; resolve(memoryHandle) }
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

/** O seletor do navegador também oferece “Nova pasta”, cobrindo criação e seleção. */
export async function selectLocalVault(): Promise<DirectoryHandle> {
  if (!window.showDirectoryPicker) throw new Error("Este navegador não permite selecionar pastas. Use Chrome ou Edge.")
  const handle = await window.showDirectoryPicker({ id: "runas-dm-vault", mode: "readwrite", startIn: "documents" }) as DirectoryHandle
  await prepareLocalVault(handle)
  await storeHandle(handle)
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

export async function localVaultName(): Promise<string> {
  return (await readLocalVaultHandle())?.name ?? ""
}

export async function syncWorkspaceToLocalVault(state: KnowledgeWorkspaceState, requestPermission = false, onProgress?: (done: number, total: number) => void, priority: VaultSyncPriority = "obsidian"): Promise<VaultSyncResult> {
  const handle = await readLocalVaultHandle()
  if (!handle) throw new Error("Selecione ou crie uma pasta de vault primeiro.")
  if (!await ensureWritePermission(handle, requestPermission)) throw new Error("O navegador revogou a permissão de escrita no vault. Abra Obsidian > Importar e sincronizar para concedê-la de novo.")
  await prepareLocalVault(handle)
  return synchronizeWorkspaceWithVault(state, createLocalVaultAdapter(handle), "", onProgress, priority)
}

/** Sem isso, a nota apagada no site continua no vault e a próxima sincronização a traz de volta. */
export async function deletePageFromLocalVault(page: KnowledgePage, requestPermission = false): Promise<void> {
  const handle = await readLocalVaultHandle()
  if (!handle) throw new Error("Selecione ou crie uma pasta de vault primeiro.")
  if (!await ensureWritePermission(handle, requestPermission)) throw new Error("O navegador revogou a permissão de escrita no vault. Abra Obsidian > Importar e sincronizar para concedê-la de novo.")
  await deleteVaultNote(page, createLocalVaultAdapter(handle), "")
}

/** Cobre a nota-hub "<Nome> (Campanha)", que pode nunca ter sido rastreada como página vinculada à campanha. */
export async function deleteCampaignHubNotesFromLocalVault(campaignTitle: string, requestPermission = false): Promise<number> {
  const handle = await readLocalVaultHandle()
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

const knownKey = (vaultName: string, kind: VaultDataKind) => `runas-dm.vault-data.${vaultName}.${kind}`

/** A revisão do arquivo que este navegador escreveu ou leu por último, por vault e por arquivo. */
export function readKnownVaultRevision(vaultName: string, kind: VaultDataKind): KnownRevision | null {
  try {
    const raw = localStorage.getItem(knownKey(vaultName, kind))
    const value = raw ? JSON.parse(raw) as Partial<KnownRevision> : null
    return value && Number.isInteger(value.revision) && typeof value.writerId === "string" ? { revision: value.revision as number, writerId: value.writerId } : null
  } catch {
    return null
  }
}

export function writeKnownVaultRevision(vaultName: string, kind: VaultDataKind, known: KnownRevision): void {
  try { localStorage.setItem(knownKey(vaultName, kind), JSON.stringify(known)) } catch { /* no máximo uma pergunta a mais */ }
}

export type VaultDataAccess = { status: "no-vault" } | { status: "permission" }

async function openVaultData(requestPermission: boolean): Promise<{ status: "ok"; name: string; adapter: VaultDataAdapter } | VaultDataAccess> {
  const handle = await readLocalVaultHandle()
  if (!handle) return { status: "no-vault" }
  if (!await ensureWritePermission(handle, requestPermission)) return { status: "permission" }
  return { status: "ok", name: handle.name, adapter: createVaultDataAdapter(handle) }
}

/** Grava o arquivo de dados. Sem permissão de escrita ele não pede sozinho (só com `requestPermission`, a partir de um clique). */
export async function saveDataToLocalVault(kind: VaultDataKind, input: VaultSaveInput, options: { requestPermission?: boolean; force?: boolean } = {}): Promise<VaultSaveOutcome | VaultDataAccess> {
  const opened = await openVaultData(options.requestPermission === true)
  if (opened.status !== "ok") return opened
  return withCrossTabLock(async () => {
    const outcome = await saveVaultData(opened.adapter, kind, input, { writerId: getDeviceId(), known: readKnownVaultRevision(opened.name, kind), force: options.force })
    if (outcome.status === "saved" || outcome.status === "unchanged") writeKnownVaultRevision(opened.name, kind, outcome.known)
    return outcome
  })
}

export async function inspectLocalVaultData(kind: VaultDataKind, options: { requestPermission?: boolean } = {}): Promise<VaultInspection | VaultDataAccess> {
  const opened = await openVaultData(options.requestPermission === true)
  if (opened.status !== "ok") return opened
  return inspectVaultData(opened.adapter, kind, readKnownVaultRevision(opened.name, kind))
}

export async function loadDataFromLocalVault<T = unknown>(kind: VaultDataKind, options: { requestPermission?: boolean } = {}): Promise<VaultLoadResult<T> | VaultDataAccess> {
  const opened = await openVaultData(options.requestPermission === true)
  if (opened.status !== "ok") return opened
  return loadVaultData<T>(opened.adapter, kind)
}

/** Depois de aplicar um arquivo neste dispositivo, a revisão dele passa a ser "conhecida": as próximas gravações continuam dele, sem conflito. */
export async function adoptVaultDataRevision(kind: VaultDataKind, header: VaultDataHeader): Promise<void> {
  const name = await localVaultName()
  if (name) writeKnownVaultRevision(name, kind, knownRevisionOf(header))
}
