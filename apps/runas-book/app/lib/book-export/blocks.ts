export type TextRun = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  fontSize?: number
}

export type Align = "left" | "center" | "right" | "justify"

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; runs: TextRun[] }
  | { type: "paragraph"; runs: TextRun[]; align?: Align }
  | { type: "list"; ordered: boolean; items: TextRun[][] }
  | { type: "blockquote"; blocks: Block[] }
  | { type: "image"; src: string; align: "left" | "center" | "right"; widthPercent: number }
  | { type: "table"; rows: TextRun[][][] }
  | { type: "hr" }
  | { type: "card"; kind: "character" | "item" | "ability" | "spell"; title: string; fields: { label: string; value: string }[]; description?: string; portraitDataUrl?: string }

function alignFromStyle(value: string): Align | undefined {
  return value === "left" || value === "center" || value === "right" || value === "justify" ? value : undefined
}

function elementToRuns(node: ChildNode, inherited: TextRun = { text: "" }): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ""
    return text ? [{ ...inherited, text }] : []
  }
  if (!(node instanceof HTMLElement)) return []
  if (node.tagName === "BR") return [{ ...inherited, text: "\n" }]
  const next: TextRun = { ...inherited, text: "" }
  switch (node.tagName) {
    case "STRONG": case "B": next.bold = true; break
    case "EM": case "I": next.italic = true; break
    case "U": next.underline = true; break
    case "S": case "STRIKE": next.strike = true; break
    case "SPAN": {
      const size = node.style.fontSize
      if (size.endsWith("px")) next.fontSize = Number.parseFloat(size)
      break
    }
    default: break
  }
  return [...node.childNodes].flatMap((child) => elementToRuns(child, next))
}

function headingLevel(tag: string, demoteBy: number): 1 | 2 | 3 | 4 | 5 | 6 {
  const base = tag === "H1" ? 1 : tag === "H2" ? 2 : 3
  return Math.min(6, base + demoteBy) as 1 | 2 | 3 | 4 | 5 | 6
}

function imageBlock(image: HTMLImageElement): Block {
  const align = image.dataset.align === "left" || image.dataset.align === "right" ? image.dataset.align : "center"
  return { type: "image", src: image.getAttribute("src") ?? "", align, widthPercent: Number(image.dataset.width) || 75 }
}

function cellRuns(cell: Element): TextRun[] {
  return [...cell.childNodes].flatMap((child) => elementToRuns(child))
}

function elementsToBlocks(nodes: ChildNode[], demoteBy: number): Block[] {
  const blocks: Block[] = []
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) blocks.push({ type: "paragraph", runs: [{ text }] })
      continue
    }
    if (!(node instanceof HTMLElement)) continue
    const align = alignFromStyle(node.style.textAlign)
    switch (node.tagName) {
      case "P": case "DIV": {
        const onlyImage = node.children.length === 1 && node.firstElementChild?.tagName === "IMG" && !node.textContent?.trim()
        blocks.push(onlyImage ? imageBlock(node.firstElementChild as HTMLImageElement) : { type: "paragraph", runs: elementToRuns(node), align })
        break
      }
      case "H1": case "H2": case "H3":
        blocks.push({ type: "heading", level: headingLevel(node.tagName, demoteBy), runs: elementToRuns(node) })
        break
      case "UL": case "OL":
        blocks.push({
          type: "list",
          ordered: node.tagName === "OL",
          items: [...node.children].filter((child): child is HTMLElement => child.tagName === "LI").map((item) => elementToRuns(item)),
        })
        break
      case "BLOCKQUOTE":
        blocks.push({ type: "blockquote", blocks: elementsToBlocks([...node.childNodes], demoteBy) })
        break
      case "IMG":
        blocks.push(imageBlock(node as HTMLImageElement))
        break
      case "TABLE": {
        const rows = [...node.querySelectorAll("tr")].map((row) => [...row.children].map((cell) => cellRuns(cell)))
        if (rows.length > 0) blocks.push({ type: "table", rows })
        break
      }
      case "HR":
        blocks.push({ type: "hr" })
        break
      default: {
        const runs = elementToRuns(node)
        if (runs.some((run) => run.text.trim())) blocks.push({ type: "paragraph", runs, align })
      }
    }
  }
  return blocks
}

/**
 * Converte o HTML sanitizado de uma página em uma árvore neutra de blocos, consumida tanto pelo exportador de
 * PDF quanto pelo de DOCX. `demoteHeadingsBy` rebaixa H1/H2/H3 do texto da página (usado dentro dos capítulos,
 * já que o título do capítulo ocupa H1 e o título da página ocupa H2 na exportação do livro).
 */
export function richTextToBlocks(html: string, options: { demoteHeadingsBy?: number } = {}): Block[] {
  if (typeof DOMParser === "undefined" || !html.trim()) return []
  const documentValue = new DOMParser().parseFromString(html, "text/html")
  return elementsToBlocks([...documentValue.body.childNodes], options.demoteHeadingsBy ?? 0)
}
