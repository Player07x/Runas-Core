/**
 * Pasta de vault falsa para os testes: implementa só o pedaço da File System Access API que o
 * `local-vault.ts` usa. O conteúdo vem de um `FakeVaultBackend`, que pode ser a memória (testes) ou
 * o disco em modo somente leitura (simulação sobre o vault real), sempre registrando as escritas.
 */

export interface FakeVaultEntry { name: string; kind: "file" | "directory" }

export interface FakeVaultBackend {
  /** Filhos diretos de uma pasta (`""` = raiz); `null` quando a pasta não existe. */
  children(directory: string): Promise<FakeVaultEntry[] | null>
  file(path: string): Promise<File | null>
  write(path: string, content: string | Blob): Promise<void>
  remove(path: string): Promise<void>
  ensureDirectory(path: string): Promise<void>
}

const notFound = (name: string) => new DOMException(`${name} não existe.`, "NotFoundError")

function join(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

class FakeFileHandle {
  readonly kind = "file" as const
  constructor(readonly name: string, private readonly path: string, private readonly backend: FakeVaultBackend) {}
  async getFile(): Promise<File> {
    const file = await this.backend.file(this.path)
    if (!file) throw notFound(this.path)
    return file
  }
  async createWritable() {
    const chunks: Array<string | Blob> = []
    return {
      write: async (content: string | Blob) => { chunks.push(content) },
      close: async () => {
        const [first] = chunks
        await this.backend.write(this.path, chunks.length === 1 && typeof first === "string" ? first : new Blob(chunks))
      },
    }
  }
}

class FakeDirectoryHandle {
  readonly kind = "directory" as const
  constructor(readonly name: string, private readonly path: string, private readonly backend: FakeVaultBackend) {}
  async queryPermission() { return "granted" as const }
  async requestPermission() { return "granted" as const }
  async *values(): AsyncIterableIterator<FakeFileHandle | FakeDirectoryHandle> {
    for (const entry of await this.backend.children(this.path) ?? []) {
      const path = join(this.path, entry.name)
      yield entry.kind === "directory" ? new FakeDirectoryHandle(entry.name, path, this.backend) : new FakeFileHandle(entry.name, path, this.backend)
    }
  }
  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<FakeDirectoryHandle> {
    const path = join(this.path, name)
    if (await this.backend.children(path) === null) {
      if (!options.create) throw notFound(path)
      await this.backend.ensureDirectory(path)
    }
    return new FakeDirectoryHandle(name, path, this.backend)
  }
  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<FakeFileHandle> {
    const path = join(this.path, name)
    if (!await this.backend.file(path)) {
      if (!options.create) throw notFound(path)
      await this.backend.write(path, "")
    }
    return new FakeFileHandle(name, path, this.backend)
  }
  async removeEntry(name: string): Promise<void> {
    await this.backend.remove(join(this.path, name))
  }
}

export function createFakeDirectoryHandle(backend: FakeVaultBackend, name = "vault"): FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle>; queryPermission(options: { mode: "readwrite" }): Promise<"granted">; requestPermission(options: { mode: "readwrite" }): Promise<"granted"> } {
  return new FakeDirectoryHandle(name, "", backend) as unknown as ReturnType<typeof createFakeDirectoryHandle>
}

/** Backend em memória: `files` mapeia caminho → conteúdo; as pastas são deduzidas dos caminhos. */
export function createMemoryVaultBackend(files: Record<string, string | Blob> = {}): FakeVaultBackend & { files: Map<string, File>; writes: string[]; removed: string[] } {
  const store = new Map<string, File>()
  const directories = new Set<string>([""])
  const writes: string[] = []
  const removed: string[] = []
  const register = (path: string) => {
    const parts = path.split("/")
    parts.pop()
    let current = ""
    for (const part of parts) { current = join(current, part); directories.add(current) }
  }
  const asFile = (path: string, content: string | Blob) => new File([content], path.split("/").pop() ?? path)
  for (const [path, content] of Object.entries(files)) { store.set(path, asFile(path, content)); register(path) }
  return {
    files: store, writes, removed,
    async children(directory) {
      if (!directories.has(directory)) return null
      const prefix = directory ? `${directory}/` : ""
      const found = new Map<string, "file" | "directory">()
      for (const path of store.keys()) if (path.startsWith(prefix)) { const [head, ...rest] = path.slice(prefix.length).split("/"); found.set(head, rest.length ? "directory" : "file") }
      for (const path of directories) if (path && path.startsWith(prefix) && path !== directory) found.set(path.slice(prefix.length).split("/")[0], "directory")
      return [...found].map(([name, kind]) => ({ name, kind }))
    },
    async file(path) { return store.get(path) ?? null },
    async write(path, content) { store.set(path, asFile(path, content)); register(path); writes.push(path) },
    async remove(path) { store.delete(path); removed.push(path) },
    async ensureDirectory(path) { directories.add(path); register(`${path}/x`) },
  }
}
