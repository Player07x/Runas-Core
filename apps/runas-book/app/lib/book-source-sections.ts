import { BOOK_SOURCE_TEXT } from "./book-sources"

// Este módulo carrega o snapshot textual completo (~1,2 MB). Ele roda no build
// (catálogo inicial) e só chega ao navegador por import dinâmico, quando uma
// página salva sem conteúdo precisa ser preenchida pela fonte.

type SourceKey = "white" | "red" | "blue" | "cronos"

interface SourceIndex {
  lines: string[]
  /** Primeira linha cuja forma normalizada corresponde a cada título. */
  firstLineByHeading: Map<string, number>
}

const sourceIndexes = new Map<SourceKey, SourceIndex>()

function normalizeSourceHeading(value: string): string {
  return value
    .replace(/^#+\s*/, "")
    .replace(/[\*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
}

function sourceKeyForFile(sourceFile: string): SourceKey {
  if (sourceFile.includes("Branco")) return "white"
  if (sourceFile.includes("Vermelho")) return "red"
  if (sourceFile.includes("Azul")) return "blue"
  return "cronos"
}

function sourceText(key: SourceKey): string {
  return key === "cronos" ? `${BOOK_SOURCE_TEXT.cronosRules}\n\n${BOOK_SOURCE_TEXT.cronosAnalysis}` : BOOK_SOURCE_TEXT[key]
}

/** Normaliza cada linha da fonte uma única vez; antes, cada página repetia a varredura completa. */
function sourceIndex(key: SourceKey): SourceIndex {
  const cached = sourceIndexes.get(key)
  if (cached) return cached
  const lines = sourceText(key).split(/\r?\n/)
  const firstLineByHeading = new Map<string, number>()
  lines.forEach((line, index) => {
    const normalized = normalizeSourceHeading(line)
    if (!firstLineByHeading.has(normalized)) firstLineByHeading.set(normalized, index)
  })
  const created = { lines, firstLineByHeading }
  sourceIndexes.set(key, created)
  return created
}

/**
 * Prepara o índice da fonte usada por `sourceFile` em pequenos lotes, cedendo a
 * thread principal entre eles; a extração seguinte reaproveita o índice pronto.
 */
export async function prepareSourceIndex(sourceFile: string, pause: () => Promise<void>): Promise<void> {
  const key = sourceKeyForFile(sourceFile)
  if (sourceIndexes.has(key)) return
  const lines = sourceText(key).split(/\r?\n/)
  const firstLineByHeading = new Map<string, number>()
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeSourceHeading(lines[index])
    if (!firstLineByHeading.has(normalized)) firstLineByHeading.set(normalized, index)
    if (index % 400 === 399) await pause()
  }
  if (!sourceIndexes.has(key)) sourceIndexes.set(key, { lines, firstLineByHeading })
}

/**
 * Recorta a seção correspondente ao título na fonte fornecida. O catálogo é
 * um snapshot estático: a leitura acontece no build e não depende dos arquivos
 * pessoais que originaram os livros.
 */
export function extractSourceSection(sourceFile: string, title: string): string {
  const key = sourceKeyForFile(sourceFile)
  const target = normalizeSourceHeading(title)
  if (!sourceText(key) || !target) return ""
  const { lines, firstLineByHeading } = sourceIndex(key)
  const start = firstLineByHeading.get(target) ?? -1
  if (start < 0) return ""

  const section: string[] = []
  let joinedLength = -1
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim()
    // Títulos de seção costumam estar sozinhos e são curtos. Não tratamos
    // frases corridas como cabeçalhos, evitando cortar listas e exemplos.
    if (section.length > 4 && line.length > 0 && line.length <= 80 && normalizeSourceHeading(line) !== target &&
      !/[.!?:;]$/.test(line) && !/^\d+[.)]/.test(line) && !/^[-•]/.test(line)) break
    section.push(lines[index])
    joinedLength += lines[index].length + 1
    if (joinedLength >= 12000) break
  }
  return section.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}
