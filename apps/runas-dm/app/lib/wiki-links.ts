import type { KnowledgePage } from "./knowledge-model"

function normalizedTarget(value: string): string {
  return value.split("#")[0].trim().replace(/\.md$/i, "").normalize("NFC").toLocaleLowerCase("pt-BR")
}

/** Resolve tanto [[Título]] quanto [[Personagens/Título]], sem alterar a nota. */
export function resolveWikiPage(target: string, pages: KnowledgePage[]): KnowledgePage | undefined {
  const normalized = normalizedTarget(target)
  if (!normalized) return undefined
  const byPath = pages.find((page) => page.obsidianPath && normalizedTarget(page.obsidianPath) === normalized)
  if (byPath) return byPath
  const byTitle = pages.find((page) => normalizedTarget(page.title) === normalized)
  if (byTitle) return byTitle
  if (normalized.includes("/")) return undefined
  return pages.find((page) => normalizedTarget(page.obsidianPath?.split("/").at(-1) ?? "") === normalized)
}
