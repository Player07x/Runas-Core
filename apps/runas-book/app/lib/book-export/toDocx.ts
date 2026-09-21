import { AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak, Paragraph, ShadingType, Table, TableCell, TableOfContents, TableRow, TextRun as DocxTextRun, WidthType, type ITableCellBorders } from "docx"
import type { BookRecord } from "../book-model"
import { CARD_KIND_LABEL, sortedChapters, sortedCustomPages } from "./bookContent"
import type { Block, TextRun } from "./blocks"
import { richTextToBlocks } from "./blocks"
import { characterCardBlock } from "./characterCard"
import { renderCoverImage } from "./coverCanvas"
import { resourceCardBlock } from "./resourceCard"

const CONTENT_WIDTH_PX = 687
const ORDERED_LIST_REF = "book-ordered-list"
const HEADING_MAP = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]
const ALIGN_MAP = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED } as const
const NO_CELL_BORDERS: ITableCellBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? ""
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function imageType(dataUrl: string): "png" | "jpg" {
  return dataUrl.startsWith("data:image/png") ? "png" : "jpg"
}

function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error("Imagem inválida"))
    image.src = src
  })
}

function runsToDocxRuns(runs: TextRun[]): DocxTextRun[] {
  if (runs.length === 0) return [new DocxTextRun("")]
  return runs.map((run) => new DocxTextRun({
    text: run.text,
    bold: run.bold,
    italics: run.italic,
    underline: run.underline ? {} : undefined,
    strike: run.strike,
    size: run.fontSize ? Math.round(run.fontSize * 1.5) : undefined,
  }))
}

async function imageParagraph(block: Extract<Block, { type: "image" }>): Promise<Paragraph> {
  const width = Math.round(CONTENT_WIDTH_PX * Math.min(1, block.widthPercent / 100))
  let height = width
  try {
    const measured = await measureImage(block.src)
    if (measured.width > 0) height = Math.round(width * (measured.height / measured.width))
  } catch { /* usa proporção quadrada se a imagem não carregar */ }
  return new Paragraph({
    alignment: block.align === "left" ? AlignmentType.LEFT : block.align === "right" ? AlignmentType.RIGHT : AlignmentType.CENTER,
    children: [new ImageRun({ data: dataUrlToBytes(block.src), type: imageType(block.src), transformation: { width, height } })],
    spacing: { before: 120, after: 160 },
  })
}

function tableToDocx(block: Extract<Block, { type: "table" }>): Table {
  const columnCount = block.rows[0]?.length ?? 1
  const rows = block.rows.map((row, rowIndex) => new TableRow({
    children: row.map((cell) => new TableCell({
      width: { size: Math.round(10000 / columnCount), type: WidthType.PERCENTAGE },
      shading: rowIndex === 0 ? { fill: "EFEFEF", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: [new Paragraph({ children: runsToDocxRuns(rowIndex === 0 ? cell.map((run) => ({ ...run, bold: true })) : cell) })],
    })),
  }))
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

function fieldCellParagraphs(field: { label: string; value: string }): Paragraph[] {
  return [
    new Paragraph({ children: [new DocxTextRun({ text: field.label.toLocaleUpperCase("pt-BR"), size: 14, bold: true, color: "8A8A8A" })] }),
    new Paragraph({ children: [new DocxTextRun({ text: field.value, size: 20 })], spacing: { after: 100 } }),
  ]
}

function cardToDocx(block: Extract<Block, { type: "card" }>, bookAccentHex: string): Table {
  // A cor da categoria, quando o DM definiu uma, vence a cor do livro.
  const accentHex = block.accent ? block.accent.replace("#", "").toUpperCase() : bookAccentHex
  const titleParagraph = new Paragraph({
    children: [
      new DocxTextRun({ text: block.title, bold: true, size: 26 }),
      new DocxTextRun({ text: `   ${CARD_KIND_LABEL[block.kind]}`, bold: true, size: 18, color: accentHex }),
    ],
    spacing: { after: 140 },
  })
  const fieldRows: TableRow[] = []
  for (let index = 0; index < block.fields.length; index += 2) {
    const pair = block.fields.slice(index, index + 2)
    fieldRows.push(new TableRow({ children: [pair[0], pair[1] ?? { label: "", value: "" }].map((field) => new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      borders: NO_CELL_BORDERS,
      children: fieldCellParagraphs(field),
    })) }))
  }
  const inner: (Paragraph | Table)[] = [titleParagraph, new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: fieldRows })]
  if (block.description) inner.push(new Paragraph({ children: [new DocxTextRun({ text: block.description, size: 20, color: "444444" })] }))
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [new TableCell({
      children: inner,
      margins: { top: 200, bottom: 200, left: 200, right: 200 },
      borders: { top: { style: BorderStyle.SINGLE, size: 4, color: "D8D8D8" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "D8D8D8" }, left: { style: BorderStyle.SINGLE, size: 4, color: "D8D8D8" }, right: { style: BorderStyle.SINGLE, size: 4, color: "D8D8D8" } },
    })] })],
  })
}

async function blockToDocx(block: Block, accentHex: string): Promise<(Paragraph | Table)[]> {
  switch (block.type) {
    case "heading":
      return [new Paragraph({ heading: HEADING_MAP[block.level - 1], children: runsToDocxRuns(block.runs) })]
    case "paragraph":
      return [new Paragraph({ alignment: block.align ? ALIGN_MAP[block.align] : undefined, children: runsToDocxRuns(block.runs), spacing: { after: 160 } })]
    case "list":
      return block.items.map((item) => new Paragraph({
        children: runsToDocxRuns(item),
        bullet: block.ordered ? undefined : { level: 0 },
        numbering: block.ordered ? { reference: ORDERED_LIST_REF, level: 0 } : undefined,
        spacing: { after: 60 },
      }))
    case "blockquote": {
      const innerParagraphs = block.blocks.filter((inner): inner is Extract<Block, { type: "paragraph" }> => inner.type === "paragraph")
      if (innerParagraphs.length === 0) return (await Promise.all(block.blocks.map((inner) => blockToDocx(inner, accentHex)))).flat()
      return innerParagraphs.map((inner) => new Paragraph({
        children: runsToDocxRuns(inner.runs.map((run) => ({ ...run, italic: true }))),
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 24, color: accentHex } },
        spacing: { after: 140 },
      }))
    }
    case "image":
      return [await imageParagraph(block)]
    case "table":
      return [tableToDocx(block)]
    case "hr":
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } }, spacing: { before: 200, after: 200 } })]
    case "card":
      return [cardToDocx(block, accentHex)]
  }
}

async function blocksToDocx(html: string, accentHex: string, demoteHeadingsBy = 0): Promise<(Paragraph | Table)[]> {
  const blocks = richTextToBlocks(html, { demoteHeadingsBy })
  const rendered = await Promise.all(blocks.map((block) => blockToDocx(block, accentHex)))
  return rendered.flat()
}

/** Gera o DOCX do livro compilado (capa, sumário, páginas customizadas e capítulos) inteiramente no navegador. */
export async function generateBookDocxBlob(book: BookRecord): Promise<Blob> {
  const accentHex = (book.accent || "#7d97a6").replace("#", "").toUpperCase()
  const coverImage = await renderCoverImage(book)
  const children: (Paragraph | Table)[] = []

  if (coverImage) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ data: dataUrlToBytes(coverImage), type: imageType(coverImage), transformation: { width: 620, height: 877 } })],
    }))
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  children.push(new Paragraph({ text: "Sumário", heading: HeadingLevel.TITLE }))
  // O Word atualiza os números de página deste campo ao abrir o documento (comportamento nativo do TableOfContents).
  children.push(new TableOfContents("Sumário", { hyperlink: true, headingStyleRange: "1-2" }))
  children.push(new Paragraph({ children: [new PageBreak()] }))

  for (const page of sortedCustomPages(book)) {
    children.push(new Paragraph({ text: page.title, heading: HeadingLevel.HEADING_1 }))
    children.push(...await blocksToDocx(page.content, accentHex))
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  for (const chapter of sortedChapters(book)) {
    children.push(new Paragraph({ text: chapter.title, heading: HeadingLevel.HEADING_1 }))
    for (const pageEntry of chapter.entries) {
      children.push(new Paragraph({ text: pageEntry.title, heading: HeadingLevel.HEADING_2 }))
      children.push(...await blocksToDocx(pageEntry.content, accentHex, 2))
      if (pageEntry.kind === "character" && pageEntry.entity) children.push(cardToDocx(characterCardBlock(pageEntry.entity), accentHex))
      for (const resource of pageEntry.resources) children.push(cardToDocx(resourceCardBlock(resource, pageEntry.resources, book.categoryColors), accentHex))
    }
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  const document = new Document({
    creator: book.author || "Runas Suite",
    title: book.title,
    numbering: { config: [{ reference: ORDERED_LIST_REF, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 260 } } } }] }] },
    sections: [{ properties: { page: { margin: { top: 1400, bottom: 1200, left: 800, right: 800 } } }, children }],
    styles: {
      default: {
        document: { run: { size: 22 }, paragraph: { spacing: { line: 300 } } },
        heading1: { run: { size: 34, bold: true, color: accentHex }, paragraph: { spacing: { before: 240, after: 160 } } },
        heading2: { run: { size: 27, bold: true, color: accentHex }, paragraph: { spacing: { before: 200, after: 120 } } },
        heading3: { run: { size: 24, bold: true, color: accentHex }, paragraph: { spacing: { before: 160, after: 100 } } },
      },
    },
  })

  return Packer.toBlob(document)
}
