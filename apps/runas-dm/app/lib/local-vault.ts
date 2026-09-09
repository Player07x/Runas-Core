import { IGNORED_VAULT_FOLDERS, WIKI_VAULT_FOLDERS, parseMarkdownFrontmatter, synchronizeWorkspaceWithVault, type VaultAdapter, type VaultSyncPriority, type VaultSyncResult } from "./obsidian-sync"
import type { KnowledgeWorkspaceState } from "./knowledge-model"

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
    await writeFile(handle, "LEIA-ME Runas DM.md", "---\nrunas_system: true\n---\n\n# Vault do Runas DM\n\nA Wiki usa Cronologia, Geografia, Personagens, Fauna, Monstros e Itens. A primeira categoria define a subpasta; as demais ficam no frontmatter. Anexos ficam em `Assets` e dados auxiliares em `Bases`.\n")
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
    if (!path && IGNORED_VAULT_FOLDERS.some((folder) => folder.localeCompare(entry.name, "pt-BR", { sensitivity: "base" }) === 0) && entry.name.localeCompare("Campanhas", "pt-BR", { sensitivity: "base" }) !== 0) continue
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

function createLocalVaultAdapter(handle: DirectoryHandle): VaultAdapter {
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
  }
}

export async function localVaultName(): Promise<string> {
  return (await readLocalVaultHandle())?.name ?? ""
}

export async function syncWorkspaceToLocalVault(state: KnowledgeWorkspaceState, requestPermission = false, onProgress?: (done: number, total: number) => void, priority: VaultSyncPriority = "obsidian"): Promise<VaultSyncResult> {
  const handle = await readLocalVaultHandle()
  if (!handle) throw new Error("Selecione ou crie uma pasta de vault primeiro.")
  if (!await ensureWritePermission(handle, requestPermission)) throw new Error("O navegador precisa renovar a permissão do vault.")
  await prepareLocalVault(handle)
  return synchronizeWorkspaceWithVault(state, createLocalVaultAdapter(handle), "", onProgress, priority)
}
