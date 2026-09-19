import type { Content, TDocumentDefinitions } from "pdfmake/interfaces"
import type { BookRecord } from "../book-model"
import { CARD_KIND_LABEL, sortedChapters, sortedCustomPages } from "./bookContent"
import type { Block, TextRun } from "./blocks"
import { richTextToBlocks } from "./blocks"
import { characterCardBlock } from "./characterCard"
import { renderCoverImage } from "./coverCanvas"
import { resourceCardBlock } from "./resourceCard"

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGINS: [number, number, number, number] = [40, 70, 40, 60]
const CONTENT_WIDTH = PAGE_WIDTH - MARGINS[0] - MARGINS[2]
const HEADING_SIZES = [22, 18, 15, 13, 12, 11]

function runsToInline(runs: TextRun[]): Content[] {
  if (runs.length === 0) return [""]
  return runs.map((run): Content => ({
    text: run.text,
    bold: run.bold || undefined,
    italics: run.italic || undefined,
    decoration: run.underline && run.strike ? ["underline", "lineThrough"] : run.underline ? "underline" : run.strike ? "lineThrough" : undefined,
    fontSize: run.fontSize,
  }))
}

function fieldCell(field: { label: string; value: string }): Content {
  return { stack: [{ text: field.label.toLocaleUpperCase("pt-BR"), fontSize: 8, bold: true, color: "#8a8a8a" }, { text: field.value, fontSize: 10.5, margin: [0, 1, 0, 0] }] }
}

function cardToPdf(block: Extract<Block, { type: "card" }>, accent: string): Content {
  const fieldRows: Content[][] = []
  for (let index = 0; index < block.fields.length; index += 2) {
    const pair = block.fields.slice(index, index + 2)
    fieldRows.push([fieldCell(pair[0]), pair[1] ? fieldCell(pair[1]) : { text: "" }])
  }
  const stack: Content[] = [
    { columns: [{ text: block.title, bold: true, fontSize: 13 }, { text: CARD_KIND_LABEL[block.kind], bold: true, fontSize: 9, color: accent, alignment: "right" }] },
    { table: { widths: ["*", "*"], body: fieldRows }, layout: "noBorders", margin: [0, 6, 0, block.description ? 6 : 0] },
  ]
  if (block.description) stack.push({ text: block.description, fontSize: 10, color: "#444444" })
  return {
    table: { widths: ["*"], body: [[{ stack, margin: [12, 10, 12, 10] }]] },
    layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => "#d8d8d8", vLineColor: () => "#d8d8d8", paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    margin: [0, 10, 0, 14],
  }
}

function blockToPdf(block: Block, accent: string, contentWidth: number): Content {
  switch (block.type) {
    case "heading":
      return { text: runsToInline(block.runs), bold: true, fontSize: HEADING_SIZES[block.level - 1], color: accent, margin: [0, 14, 0, 6] }
    case "paragraph":
      return { text: runsToInline(block.runs), alignment: block.align, margin: [0, 0, 0, 8] }
    case "list":
      return block.ordered
        ? { ol: block.items.map((item) => ({ text: runsToInline(item) })), margin: [0, 0, 0, 8] }
        : { ul: block.items.map((item) => ({ text: runsToInline(item) })), margin: [0, 0, 0, 8] }
    case "blockquote":
      return {
        table: { widths: [4, "*"], body: [[
          { text: "", fillColor: accent, border: [false, false, false, false] },
          { stack: block.blocks.map((inner) => blockToPdf(inner, accent, contentWidth - 20)), border: [false, false, false, false], margin: [10, 4, 0, 4], italics: true, color: "#555555" },
        ]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
        margin: [0, 6, 0, 12],
      }
    case "image": {
      const width = Math.round(contentWidth * Math.min(1, block.widthPercent / 100))
      return { image: block.src, width, alignment: block.align, margin: [0, 8, 0, 10] }
    }
    case "table":
      return {
        table: { headerRows: 1, widths: (block.rows[0] ?? []).map(() => "*"), body: block.rows.map((row) => row.map((cell): Content => ({ text: runsToInline(cell), fontSize: 10 }))) },
        layout: "lightHorizontalLines",
        margin: [0, 8, 0, 12],
      }
    case "hr":
      return { canvas: [{ type: "line", x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: 1, lineColor: "#cfcfcf" }], margin: [0, 10, 0, 10] }
    case "card":
      return cardToPdf(block, accent)
  }
}

function pageBlocks(html: string, demoteHeadingsBy: number, accent: string): Content[] {
  return richTextToBlocks(html, { demoteHeadingsBy }).map((block) => blockToPdf(block, accent, CONTENT_WIDTH))
}

/** Gera o PDF do livro compilado (capa, sumário, páginas customizadas e capítulos) inteiramente no navegador. */
export async function generateBookPdfBlob(book: BookRecord): Promise<Blob> {
  // Import dinâmico de um módulo CJS: `.default` é a instância mutável real; o namespace do `import *`
  // é somente leitura e quebra `addFontContainer`, que atribui `this.fonts` internamente.
  const pdfMake = (await import("pdfmake/build/pdfmake")).default
  const robotoFontContainer = (await import("pdfmake/build/fonts/Roboto")).default
  pdfMake.addFontContainer(robotoFontContainer)

  const accent = book.accent || "#7d97a6"
  const coverImage = await renderCoverImage(book)
  const content: Content[] = []

  if (coverImage) content.push({ image: coverImage, width: PAGE_WIDTH, height: PAGE_HEIGHT, margin: [-MARGINS[0], -MARGINS[1], -MARGINS[2], -MARGINS[3]], pageBreak: "after" })

  content.push({ text: "Sumário", fontSize: 22, bold: true, color: accent, margin: [0, 0, 0, 16] })
  content.push({ text: "", toc: { id: "main" } } as unknown as Content)

  const customPages = sortedCustomPages(book)
  for (const page of customPages) {
    content.push({ text: "", pageBreak: "before" })
    content.push({ text: page.title, fontSize: 20, bold: true, color: accent, margin: [0, 0, 0, 14] })
    content.push(...pageBlocks(page.content, 0, accent))
  }

  const chapters = sortedChapters(book)
  for (const chapter of chapters) {
    content.push({ text: "", pageBreak: "before" })
    content.push({
      text: chapter.title, tocItem: "main", tocStyle: { bold: true, fontSize: 11 },
      fontSize: 26, bold: true, color: accent, margin: [0, 0, 0, 20],
    } as unknown as Content)
    for (const pageEntry of chapter.entries) {
      content.push({
        text: pageEntry.title, tocItem: "main", tocMargin: [16, 1, 0, 1], tocStyle: { fontSize: 9.5, color: "#555555" },
        fontSize: 16, bold: true, color: accent, margin: [0, 16, 0, 8],
      } as unknown as Content)
      content.push(...pageBlocks(pageEntry.content, 2, accent))
      if (pageEntry.kind === "character" && pageEntry.entity) content.push(cardToPdf(characterCardBlock(pageEntry.entity), accent))
      for (const resource of pageEntry.resources) content.push(cardToPdf(resourceCardBlock(resource, pageEntry.resources), accent))
    }
  }

  const docDefinition: TDocumentDefinitions = {
    pageMargins: MARGINS,
    header: (currentPage) => currentPage <= 2 ? undefined : { text: book.title, alignment: "right", fontSize: 8, color: accent, margin: [40, 26, 40, 0] },
    footer: (currentPage) => currentPage <= 1 ? undefined : { text: String(currentPage - 1), alignment: "center", fontSize: 9, color: "#888888", margin: [0, 8, 0, 0] },
    content,
    defaultStyle: { font: "Roboto", fontSize: 11, lineHeight: 1.3 },
    info: { title: book.title, author: book.author || undefined },
  }

  const pdfDocument = pdfMake.createPdf(docDefinition)
  return pdfDocument.getBlob()
}
