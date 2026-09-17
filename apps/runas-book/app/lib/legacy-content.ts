import { escapeHtml, plainBlockToHtml, type LegacyContentRequest } from "./book-model"
import { CORE_RULE_NOTES } from "./book-rule-notes"
import { extractSourceSection, prepareSourceIndex } from "./book-source-sections"

// Carregado por import dinâmico somente quando o armazenamento local tem
// páginas sem conteúdo. Mantém a mesma composição que o carregamento sempre
// aplicou a essas páginas: fonte, nota do núcleo e trecho do livro (ou resumo).

function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (scheduler?.yield) return scheduler.yield()
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function resolveLegacyContent(requests: LegacyContentRequest[]): Promise<Map<string, string>> {
  const contents = new Map<string, string>()
  for (const request of requests) {
    await prepareSourceIndex(request.sourceFile, yieldToMain)
    const coreNote = CORE_RULE_NOTES[request.title]
    const content = [
      request.sourceFile ? `<p class="content-source"><em>${escapeHtml(`Fonte: ${request.sourceFile}.`)}</em></p>` : "",
      coreNote ? `<blockquote class="content-core-note">${plainBlockToHtml(coreNote)}</blockquote>` : "",
      plainBlockToHtml(extractSourceSection(request.sourceFile, request.title) || request.summary),
    ].filter(Boolean).join("")
    if (content) contents.set(request.key, content)
    await yieldToMain()
  }
  return contents
}
