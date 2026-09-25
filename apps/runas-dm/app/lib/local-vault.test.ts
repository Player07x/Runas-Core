import { describe, expect, it } from "vitest"
import { createFakeDirectoryHandle, createMemoryVaultBackend } from "./fake-vault-handle"
import { normalizeKnowledgeWorkspace } from "./knowledge-model"
import { createLocalVaultAdapter } from "./local-vault"
import { synchronizeWorkspaceWithVault } from "./obsidian-sync"

const NOTE = (title: string, extra = "") => `---\n${extra}---\n# ${title}\n\nTexto de ${title}.\n`

function vault(files: Record<string, string>) {
  const backend = createMemoryVaultBackend(files)
  const handle = createFakeDirectoryHandle(backend)
  return { backend, adapter: createLocalVaultAdapter(handle as never) }
}

describe("o que o Runas DM lê do vault", () => {
  it("desce somente nas pastas da lista de permissão; o resto do vault nem é listado", async () => {
    const { adapter } = vault({
      "Geografia/Assentamentos/Duna.md": NOTE("Duna"),
      "Personagens/Ayan.md": NOTE("Ayan"),
      "Campanhas/[O&C] Lion Heart pt. II/Anotações/Sessão 1.md": NOTE("Sessão 1"),
      "Cronologia Geral/Era das Runas.md": NOTE("Era das Runas"),
      "Runas Book/Status.md": NOTE("Status"),
      "Runas-Book/Personagens/Ayan.md": NOTE("Ayan do Livro"),
      "Templates/Modelo.md": NOTE("Modelo"),
      "_Arquivo morto/Antiga.md": NOTE("Antiga"),
      "Outros Documentos/Rascunho.md": NOTE("Rascunho"),
      "Histórias/Insígnia Alva/_brainstorm.md": NOTE("brainstorm"),
      "Runas DM/LEIA-ME.md": NOTE("LEIA-ME"),
      "Assets/Runas DM Backups/Duna-abc.md": NOTE("Duna"),
      "LEIA-ME Runas DM.md": NOTE("LEIA-ME"),
      "Solta.md": NOTE("Solta"),
    })
    expect((await adapter.listMarkdownFiles("")).sort()).toEqual([
      "Campanhas/[O&C] Lion Heart pt. II/Anotações/Sessão 1.md",
      "Cronologia Geral/Era das Runas.md",
      "Geografia/Assentamentos/Duna.md",
      "Personagens/Ayan.md",
    ])
  })
})

describe("sincronização com um vault que tem notas de outros apps", () => {
  const bookNote = "---\nrunas_book: true\nrunas_book_id: \"cap-1\"\n---\n# Capítulo 1\n\nTexto do Livro Vermelho.\n"

  it("um vault com o Livro Vermelho e uma cópia antiga rastreada não recebe nenhuma escrita em Runas Book", async () => {
    const { backend, adapter } = vault({
      "Runas Book/Capítulo 1.md": bookNote,
      "Runas Book/Personagens/Ayan.md": bookNote.replace("Capítulo 1", "Ayan"),
      "Geografia/Assentamentos/Duna.md": NOTE("Duna"),
    })
    // O site já rastreava as notas do Livro (importação antiga) com o texto divergente: o laço de exportação as reescreveria.
    const tracked = normalizeKnowledgeWorkspace({
      pages: [
        { id: "livro-1", scope: "wiki", kind: "event", title: "Capítulo 1", contentHtml: "<p>Editado no site</p>", obsidianPath: "Runas Book/Capítulo 1.md", obsidianSourceMarkdown: bookNote, obsidianFingerprint: "outro", createdAt: 1, updatedAt: 2 },
        { id: "livro-2", scope: "wiki", kind: "characters", title: "Ayan", contentHtml: "<p>Editado no site</p>", obsidianPath: "Runas Book/Personagens/Ayan.md", obsidianSourceMarkdown: bookNote, obsidianFingerprint: "outro", createdAt: 1, updatedAt: 2 },
      ],
      updatedAt: 2,
    })
    const result = await synchronizeWorkspaceWithVault(tracked, adapter, "")
    expect(backend.writes.filter((path) => path.startsWith("Runas Book/") || path.startsWith("Assets/Runas DM Backups/"))).toEqual([])
    expect(backend.removed).toEqual([])
    expect(backend.files.get("Runas Book/Capítulo 1.md")).toBeDefined()
    // A página nativa da Wiki continua sendo importada normalmente.
    expect(result.state.pages.some((page) => page.title === "Duna")).toBe(true)
  })
})
