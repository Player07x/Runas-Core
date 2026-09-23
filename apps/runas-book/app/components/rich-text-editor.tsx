"use client"

import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Columns3, Eraser, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Rows3, Strikethrough, Table2, Trash2, Underline, Unlink, X } from "lucide-react"
import { sanitizeRichText } from "../lib/rich-text"

const FONT_SIZES = [
  { label: "Pequeno", px: 12 },
  { label: "Normal", px: 15 },
  { label: "Médio", px: 18 },
  { label: "Grande", px: 22 },
  { label: "Título", px: 28 },
  { label: "Enorme", px: 36 },
]

const BLOCK_OPTIONS = [
  { label: "Parágrafo", value: "P" },
  { label: "Título 1", value: "H1" },
  { label: "Título 2", value: "H2" },
  { label: "Título 3", value: "H3" },
  { label: "Citação", value: "BLOCKQUOTE" },
]

const TABLE_STYLES = [
  { value: "plain", label: "Tabela padrão" },
  { value: "striped", label: "Zebrada" },
  { value: "accent", label: "Cabeçalho destacado" },
  { value: "compact", label: "Compacta" },
]

const TABLE_PICKER_ROWS = 8
const TABLE_PICKER_COLS = 8

type TableHandles = {
  tableLeft: number
  tableTop: number
  rows: Array<{ index: number; top: number; height: number }>
  cols: Array<{ index: number; left: number; width: number }>
}

type RichTextEditorProps = {
  label: string
  value: string
  onChange: (value: string) => void
  wikiPageTitles?: string[]
  className?: string
}

export function RichTextEditor({ label, value, onChange, wikiPageTitles = [], className = "" }: RichTextEditorProps) {
  const id = useId()
  const editorRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const selectedImageRef = useRef<HTMLImageElement | null>(null)
  const activeTableRef = useRef<HTMLTableElement | null>(null)
  const activeCellRef = useRef<HTMLTableCellElement | null>(null)
  const savedSelectionRef = useRef<Range | null>(null)
  const wikiRangeRef = useRef<Range | null>(null)
  const lastEmittedValueRef = useRef("")
  const lastRowClickRef = useRef<number | null>(null)
  const lastColClickRef = useRef<number | null>(null)
  const [imageSelected, setImageSelected] = useState(false)
  const [imageWidth, setImageWidth] = useState(75)
  const [imageAlign, setImageAlign] = useState<"left" | "center" | "right">("center")
  const [insideTable, setInsideTable] = useState(false)
  const [tableStyle, setTableStyle] = useState("plain")
  const [tableInsertOpen, setTableInsertOpen] = useState(false)
  const [tableRows, setTableRows] = useState(2)
  const [tableCols, setTableCols] = useState(3)
  const [tableHandles, setTableHandles] = useState<TableHandles | null>(null)
  const [selectedRows, setSelectedRows] = useState<number[]>([])
  const [selectedCols, setSelectedCols] = useState<number[]>([])
  const [wikiQuery, setWikiQuery] = useState<string | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const safe = sanitizeRichText(value)
    if (safe !== lastEmittedValueRef.current) {
      if (editor.innerHTML !== safe) editor.innerHTML = safe
      lastEmittedValueRef.current = safe
    }
  }, [value])

  function emitCurrentValue(normalizeDom = false) {
    const editor = editorRef.current
    if (!editor) return
    const safe = sanitizeRichText(editor.innerHTML)
    lastEmittedValueRef.current = safe
    if (normalizeDom && editor.innerHTML !== safe) editor.innerHTML = safe
    onChange(safe)
  }

  function command(name: string, argument?: string) {
    editorRef.current?.focus()
    document.execCommand(name, false, argument)
    emitCurrentValue()
  }

  function applyFontSize(px: number) {
    editorRef.current?.focus()
    document.execCommand("fontSize", false, "7")
    const editor = editorRef.current
    editor?.querySelectorAll('font[size="7"]').forEach((node) => {
      const span = document.createElement("span")
      span.style.fontSize = `${px}px`
      span.innerHTML = node.innerHTML
      node.replaceWith(span)
    })
    emitCurrentValue()
  }

  function createWikiAnchor(title: string, label = title): HTMLAnchorElement {
    const anchor = document.createElement("a")
    anchor.href = `#wiki:${encodeURIComponent(title)}`
    anchor.dataset.wikiTitle = title
    anchor.textContent = label
    return anchor
  }

  function placeCaretAfter(node: Node) {
    const selection = window.getSelection()
    const range = document.createRange()
    range.setStartAfter(node)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  function convertCompletedWikiLink(): boolean {
    const editor = editorRef.current
    const selection = window.getSelection()
    const textNode = selection?.anchorNode
    const offset = selection?.anchorOffset ?? 0
    if (!editor || !textNode || textNode.nodeType !== Node.TEXT_NODE || !editor.contains(textNode)) return false
    const textBeforeCaret = textNode.textContent?.slice(0, offset) ?? ""
    const match = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]$/.exec(textBeforeCaret)
    if (!match || match.index === undefined) return false

    const title = match[1].trim()
    const label = match[2]?.trim() || title
    if (!title) return false
    const range = document.createRange()
    range.setStart(textNode, match.index)
    range.setEnd(textNode, offset)
    range.deleteContents()
    const anchor = createWikiAnchor(title, label)
    const spacer = document.createTextNode(" ")
    range.insertNode(spacer)
    range.insertNode(anchor)
    placeCaretAfter(spacer)
    setWikiQuery(null)
    wikiRangeRef.current = null
    return true
  }

  function updateWikiSuggestions() {
    const editor = editorRef.current
    const selection = window.getSelection()
    const textNode = selection?.anchorNode
    const offset = selection?.anchorOffset ?? 0
    if (!editor || !textNode || textNode.nodeType !== Node.TEXT_NODE || !editor.contains(textNode)) {
      setWikiQuery(null)
      wikiRangeRef.current = null
      return
    }
    const textBeforeCaret = textNode.textContent?.slice(0, offset) ?? ""
    const match = /\[\[([^\]\n]*)$/.exec(textBeforeCaret)
    if (!match || match.index === undefined) {
      setWikiQuery(null)
      wikiRangeRef.current = null
      return
    }
    const range = document.createRange()
    range.setStart(textNode, match.index)
    range.setEnd(textNode, offset)
    wikiRangeRef.current = range.cloneRange()
    setWikiQuery(match[1])
  }

  function insertWikiLink(title: string) {
    const range = wikiRangeRef.current
    if (!range) return
    range.deleteContents()
    const anchor = createWikiAnchor(title)
    const spacer = document.createTextNode(" ")
    range.insertNode(spacer)
    range.insertNode(anchor)
    placeCaretAfter(spacer)
    setWikiQuery(null)
    wikiRangeRef.current = null
    emitCurrentValue()
  }

  function computeTableHandles(table: HTMLTableElement) {
    const wrap = wrapRef.current
    if (!wrap) { setTableHandles(null); return }
    const wrapRect = wrap.getBoundingClientRect()
    const tableRect = table.getBoundingClientRect()
    const rowEls = [...table.querySelectorAll("tr")] as HTMLTableRowElement[]
    const rows = rowEls.map((row, index) => {
      const rect = row.getBoundingClientRect()
      return { index, top: rect.top - wrapRect.top, height: rect.height }
    })
    const firstRow = rowEls[0]
    const cellEls = firstRow ? ([...firstRow.children] as HTMLTableCellElement[]) : []
    const cols = cellEls.map((cell, index) => {
      const rect = cell.getBoundingClientRect()
      return { index, left: rect.left - wrapRect.left, width: rect.width }
    })
    setTableHandles({ rows, cols, tableLeft: tableRect.left - wrapRect.left, tableTop: tableRect.top - wrapRect.top })
  }

  function clearTableSelection() {
    setSelectedRows([])
    setSelectedCols([])
  }

  function updateTableContext() {
    const selection = window.getSelection()
    const node = selection?.anchorNode
    const element = node instanceof HTMLElement ? node : node?.parentElement
    const cell = element?.closest("td, th") as HTMLTableCellElement | null
    const table = cell?.closest("table") as HTMLTableElement | null
    if (cell && table && editorRef.current?.contains(table)) {
      activeCellRef.current = cell
      activeTableRef.current = table
      setTableStyle(table.dataset.style || "plain")
      setInsideTable(true)
      computeTableHandles(table)
      // Um clique numa célula é sempre edição pontual; a seleção de linhas
      // ou colunas só existe enquanto vier das alças, nunca do próprio texto.
      clearTableSelection()
    } else {
      activeTableRef.current = null
      setInsideTable(false)
      setTableHandles(null)
      clearTableSelection()
    }
  }

  useEffect(() => {
    if (!insideTable) return
    const onResize = () => { if (activeTableRef.current) computeTableHandles(activeTableRef.current) }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [insideTable])

  useEffect(() => {
    const table = activeTableRef.current
    if (!table) return
    const rowEls = [...table.querySelectorAll("tr")] as HTMLTableRowElement[]
    rowEls.forEach((row, rowIndex) => {
      const rowActive = selectedRows.includes(rowIndex)
      row.classList.toggle("rt-row-selected", rowActive)
      ;[...row.children].forEach((cell, colIndex) => {
        cell.classList.toggle("rt-cell-selected", rowActive || selectedCols.includes(colIndex))
      })
    })
  }, [selectedRows, selectedCols])

  function toggleRowSelection(index: number, event: ReactMouseEvent) {
    event.preventDefault()
    setSelectedCols([])
    setSelectedRows((current) => {
      if (event.shiftKey && lastRowClickRef.current !== null) {
        const [start, end] = [lastRowClickRef.current, index].sort((a, b) => a - b)
        return Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
      }
      if (event.metaKey || event.ctrlKey) {
        lastRowClickRef.current = index
        return current.includes(index) ? current.filter((value) => value !== index) : [...current, index]
      }
      lastRowClickRef.current = index
      return current.length === 1 && current[0] === index ? [] : [index]
    })
  }

  function toggleColSelection(index: number, event: ReactMouseEvent) {
    event.preventDefault()
    setSelectedRows([])
    setSelectedCols((current) => {
      if (event.shiftKey && lastColClickRef.current !== null) {
        const [start, end] = [lastColClickRef.current, index].sort((a, b) => a - b)
        return Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
      }
      if (event.metaKey || event.ctrlKey) {
        lastColClickRef.current = index
        return current.includes(index) ? current.filter((value) => value !== index) : [...current, index]
      }
      lastColClickRef.current = index
      return current.length === 1 && current[0] === index ? [] : [index]
    })
  }

  function handleEditorInput() {
    convertCompletedWikiLink()
    updateWikiSuggestions()
    updateTableContext()
    emitCurrentValue()
  }

  function createLink() {
    const href = window.prompt("Endereço do link (https:// ou obsidian://)")?.trim()
    if (!href || !/^(https:|obsidian:|#)/i.test(href)) return
    command("createLink", href)
  }

  async function insertImage(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Imagem inválida"))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error("Imagem inválida"))
      element.src = source
    })
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height)
    editorRef.current?.focus()
    document.execCommand("insertImage", false, canvas.toDataURL("image/jpeg", .78))
    const inserted = editorRef.current?.querySelector("img:last-of-type") as HTMLImageElement | null
    if (inserted) {
      inserted.alt = file.name.replace(/\.[^.]+$/, "")
      inserted.dataset.width = "75"
      inserted.dataset.align = "center"
      inserted.style.width = "75%"
      selectedImageRef.current = inserted
      setImageSelected(true)
      setImageWidth(75)
      setImageAlign("center")
    }
    emitCurrentValue()
  }

  function formatImage(width = imageWidth, align = imageAlign) {
    const selectedImage = selectedImageRef.current
    if (!selectedImage || !editorRef.current?.contains(selectedImage)) return
    selectedImage.dataset.width = String(width)
    selectedImage.dataset.align = align
    selectedImage.style.width = `${width}%`
    setImageWidth(width)
    setImageAlign(align)
    emitCurrentValue()
  }

  function tableContext(): { table: HTMLTableElement; row: HTMLTableRowElement; cell: HTMLTableCellElement } | null {
    const selection = window.getSelection()
    const node = selection?.anchorNode
    const element = node instanceof HTMLElement ? node : node?.parentElement
    const cell = (element?.closest("td, th") as HTMLTableCellElement | null) ?? activeCellRef.current
    const row = cell?.closest("tr") ?? null
    const table = (cell?.closest("table") as HTMLTableElement | null) ?? activeTableRef.current
    if (!cell || !row || !table || !editorRef.current?.contains(table)) return null
    return { table, row, cell }
  }

  function rememberEditorSelection() {
    const selection = window.getSelection()
    if (!selection?.rangeCount || !editorRef.current) return
    const range = selection.getRangeAt(0)
    if (editorRef.current.contains(range.commonAncestorContainer)) savedSelectionRef.current = range.cloneRange()
  }

  function restoreEditorSelection() {
    const selection = window.getSelection()
    const range = savedSelectionRef.current
    if (!selection || !range || !editorRef.current?.contains(range.commonAncestorContainer)) return
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function insertTable(rowsValue = tableRows, colsValue = tableCols) {
    const rows = Math.max(1, Math.min(20, Math.trunc(Number(rowsValue)) || 1))
    const cols = Math.max(1, Math.min(10, Math.trunc(Number(colsValue)) || 1))
    const headerCells = Array.from({ length: cols }, () => "<th>&nbsp;</th>").join("")
    const bodyRow = `<tr>${Array.from({ length: cols }, () => "<td>&nbsp;</td>").join("")}</tr>`
    const html = `<table data-style="plain"><thead><tr>${headerCells}</tr></thead><tbody>${Array.from({ length: rows }, () => bodyRow).join("")}</tbody></table><p><br></p>`
    editorRef.current?.focus()
    restoreEditorSelection()
    document.execCommand("insertHTML", false, html)
    setTableInsertOpen(false)
    emitCurrentValue()
  }

  function selectTableSize(rows: number, cols: number) {
    setTableRows(rows)
    setTableCols(cols)
  }

  function applyTableStyle(style: string) {
    const context = tableContext()
    if (!context) return
    context.table.dataset.style = style
    activeTableRef.current = context.table
    setTableStyle(style)
    emitCurrentValue()
  }

  function setCellAlignment(align: "left" | "center" | "right") {
    const table = activeTableRef.current
    if (table && (selectedRows.length > 0 || selectedCols.length > 0)) {
      const rowEls = [...table.querySelectorAll("tr")] as HTMLTableRowElement[]
      rowEls.forEach((row, rowIndex) => {
        [...row.children].forEach((cell, colIndex) => {
          if (selectedRows.includes(rowIndex) || selectedCols.includes(colIndex)) (cell as HTMLElement).style.textAlign = align
        })
      })
      emitCurrentValue()
      return
    }
    const context = tableContext()
    if (!context) return
    context.cell.style.textAlign = align
    activeCellRef.current = context.cell
    emitCurrentValue()
  }

  function toggleTableHeader() {
    const context = tableContext()
    if (!context) return
    const rowEls = [...context.table.querySelectorAll("tr")] as HTMLTableRowElement[]
    const targets = selectedRows.length > 0 ? selectedRows.map((index) => rowEls[index]).filter((row): row is HTMLTableRowElement => Boolean(row)) : rowEls[0] ? [rowEls[0]] : []
    targets.forEach((row) => {
      row.querySelectorAll("th, td").forEach((cell) => {
        const replacement = document.createElement(cell.tagName === "TH" ? "td" : "th")
        replacement.innerHTML = cell.innerHTML
        for (const attribute of [...cell.attributes]) replacement.setAttribute(attribute.name, attribute.value)
        cell.replaceWith(replacement)
      })
    })
    updateTableContext()
    emitCurrentValue()
  }

  function insertTableRow() {
    const context = tableContext()
    if (!context) return
    const newRow = context.row.cloneNode(true) as HTMLTableRowElement
    newRow.querySelectorAll("td, th").forEach((cell) => { cell.innerHTML = "&nbsp;" })
    context.row.after(newRow)
    computeTableHandles(context.table)
    emitCurrentValue()
  }

  function deleteTableRow() {
    const table = activeTableRef.current
    if (table && selectedRows.length > 0) {
      const rowEls = [...table.querySelectorAll("tr")] as HTMLTableRowElement[]
      if (rowEls.length - selectedRows.length < 1) return
      ;[...selectedRows].sort((left, right) => right - left).forEach((index) => rowEls[index]?.remove())
      clearTableSelection()
      computeTableHandles(table)
      emitCurrentValue()
      return
    }
    const context = tableContext()
    if (!context) return
    if (context.table.querySelectorAll("tr").length <= 1) return
    context.row.remove()
    setInsideTable(false)
    emitCurrentValue()
  }

  function insertTableColumn() {
    const context = tableContext()
    if (!context) return
    const cellIndex = [...context.row.children].indexOf(context.cell)
    context.table.querySelectorAll("tr").forEach((row) => {
      const cell = row.children[cellIndex] as HTMLTableCellElement | undefined
      const newCell = document.createElement(cell?.tagName === "TH" ? "th" : "td")
      newCell.innerHTML = "&nbsp;"
      if (cell) cell.after(newCell); else row.appendChild(newCell)
    })
    computeTableHandles(context.table)
    emitCurrentValue()
  }

  function deleteTableColumn() {
    const table = activeTableRef.current
    if (table && selectedCols.length > 0) {
      const rowEls = [...table.querySelectorAll("tr")] as HTMLTableRowElement[]
      const colCount = rowEls[0]?.children.length ?? 0
      if (colCount - selectedCols.length < 1) return
      const indices = [...selectedCols].sort((left, right) => right - left)
      rowEls.forEach((row) => indices.forEach((index) => row.children[index]?.remove()))
      clearTableSelection()
      computeTableHandles(table)
      emitCurrentValue()
      return
    }
    const context = tableContext()
    if (!context) return
    const cellIndex = [...context.row.children].indexOf(context.cell)
    if ((context.table.querySelector("tr")?.children.length ?? 0) <= 1) return
    context.table.querySelectorAll("tr").forEach((row) => { row.children[cellIndex]?.remove() })
    setInsideTable(false)
    emitCurrentValue()
  }

  const tools = [
    { label: "Negrito", icon: Bold, command: "bold" },
    { label: "Itálico", icon: Italic, command: "italic" },
    { label: "Sublinhado", icon: Underline, command: "underline" },
    { label: "Tachado", icon: Strikethrough, command: "strikeThrough" },
  ]
  const alignTools = [
    { label: "Alinhar à esquerda", icon: AlignLeft, command: "justifyLeft" },
    { label: "Centralizar", icon: AlignCenter, command: "justifyCenter" },
    { label: "Alinhar à direita", icon: AlignRight, command: "justifyRight" },
    { label: "Justificar", icon: AlignJustify, command: "justifyFull" },
  ]
  const listTools = [
    { label: "Lista", icon: List, command: "insertUnorderedList" },
    { label: "Lista numerada", icon: ListOrdered, command: "insertOrderedList" },
  ]
  const suggestedWikiTitles = wikiQuery === null ? [] : wikiPageTitles
    .filter((title) => title.toLocaleLowerCase("pt-BR").includes(wikiQuery.trim().toLocaleLowerCase("pt-BR")))
    .slice(0, 8)

  return <div className={`rich-text-field ${className}`}>
    <span id={`${id}-label`}>{label}</span>
    <div className="rich-text-shell">
      <div className="rich-text-toolbar">
        <select className="rich-text-block-select" aria-label="Estilo do bloco" onChange={(event) => { command("formatBlock", event.target.value); event.target.value = "" }} defaultValue="">
          <option value="" disabled>Estilo…</option>
          {BLOCK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select className="rich-text-size-select" aria-label="Tamanho da fonte" onChange={(event) => { applyFontSize(Number(event.target.value)); event.target.value = "" }} defaultValue="">
          <option value="" disabled>Tamanho…</option>
          {FONT_SIZES.map((size) => <option key={size.px} value={size.px}>{size.label}</option>)}
        </select>
        <i />
        {tools.map(({ label: toolLabel, icon: Icon, command: toolCommand }) => <button key={toolLabel} type="button" title={toolLabel} aria-label={toolLabel} onMouseDown={(event) => event.preventDefault()} onClick={() => command(toolCommand)}><Icon size={15} /></button>)}
        <i />
        {alignTools.map(({ label: toolLabel, icon: Icon, command: toolCommand }) => <button key={toolLabel} type="button" title={toolLabel} aria-label={toolLabel} onMouseDown={(event) => event.preventDefault()} onClick={() => command(toolCommand)}><Icon size={15} /></button>)}
        <i />
        {listTools.map(({ label: toolLabel, icon: Icon, command: toolCommand }) => <button key={toolLabel} type="button" title={toolLabel} aria-label={toolLabel} onMouseDown={(event) => event.preventDefault()} onClick={() => command(toolCommand)}><Icon size={15} /></button>)}
        <button type="button" title="Citação" aria-label="Citação" onMouseDown={(event) => event.preventDefault()} onClick={() => command("formatBlock", "BLOCKQUOTE")}><Quote size={15} /></button>
        <button type="button" title="Limpar formatação" aria-label="Limpar formatação" onMouseDown={(event) => event.preventDefault()} onClick={() => command("removeFormat")}><Eraser size={15} /></button>
        <i />
        <button type="button" title="Inserir link" aria-label="Inserir link" onMouseDown={(event) => event.preventDefault()} onClick={createLink}><Link2 size={15} /></button>
        <button type="button" title="Remover link" aria-label="Remover link" onMouseDown={(event) => event.preventDefault()} onClick={() => command("unlink")}><Unlink size={15} /></button>
        <button type="button" title="Inserir imagem" aria-label="Inserir imagem" onClick={() => imageInputRef.current?.click()}><ImagePlus size={15} /></button>
        <button type="button" title="Inserir tabela" aria-label="Inserir tabela" aria-expanded={tableInsertOpen} onMouseDown={(event) => { event.preventDefault(); rememberEditorSelection() }} onClick={() => setTableInsertOpen((value) => !value)}><Table2 size={15} /></button>
        {tableInsertOpen && <div className="rich-text-table-picker" aria-label="Selecionar tamanho da tabela">
          <div className="rich-text-table-picker-heading"><strong>{tableRows} × {tableCols}</strong><span>linhas × colunas</span></div>
          <div className="rich-text-table-grid" role="grid" aria-label="Grade de seleção da tabela">
            {Array.from({ length: TABLE_PICKER_ROWS }, (_, rowIndex) => <div key={rowIndex} role="row">
              {Array.from({ length: TABLE_PICKER_COLS }, (_, colIndex) => {
                const rows = rowIndex + 1
                const cols = colIndex + 1
                const active = rows <= tableRows && cols <= tableCols
                return <button key={colIndex} type="button" role="gridcell" aria-label={`${rows} linhas por ${cols} colunas`} aria-selected={active} className={active ? "active" : ""} onMouseEnter={() => selectTableSize(rows, cols)} onFocus={() => selectTableSize(rows, cols)} onMouseDown={(event) => event.preventDefault()} onClick={() => insertTable(rows, cols)} />
              })}
            </div>)}
          </div>
          <span className="rich-text-table-picker-hint">Aponte para selecionar e clique para inserir.</span>
        </div>}
        {imageSelected && <div className="rich-text-image-tools" aria-label="Formatação da imagem">
          <i />
          <button type="button" aria-pressed={imageAlign === "left"} title="Alinhar à esquerda e envolver com texto" aria-label="Alinhar imagem à esquerda e envolver com texto" onClick={() => formatImage(imageWidth, "left")}><AlignLeft size={15} /></button>
          <button type="button" aria-pressed={imageAlign === "center"} title="Centralizar imagem" aria-label="Centralizar imagem" onClick={() => formatImage(imageWidth, "center")}><AlignCenter size={15} /></button>
          <button type="button" aria-pressed={imageAlign === "right"} title="Alinhar à direita e envolver com texto" aria-label="Alinhar imagem à direita e envolver com texto" onClick={() => formatImage(imageWidth, "right")}><AlignRight size={15} /></button>
          <label className="rich-text-image-size"><span>Tamanho</span><input aria-label="Tamanho da imagem em porcentagem" type="range" min="20" max="100" step="5" value={imageWidth} onChange={(event) => formatImage(Number(event.target.value), imageAlign)} /><output>{imageWidth}%</output></label>
        </div>}
        {insideTable && <div className="rich-text-table-tools" aria-label="Estilo e formatação da tabela">
          <i />
          {(selectedRows.length > 0 || selectedCols.length > 0) && <span className="rt-selection-badge">{selectedRows.length > 0 ? `${selectedRows.length} linha${selectedRows.length === 1 ? "" : "s"}` : `${selectedCols.length} coluna${selectedCols.length === 1 ? "" : "s"}`} selecionada{(selectedRows.length || selectedCols.length) === 1 ? "" : "s"}<button type="button" title="Limpar seleção" aria-label="Limpar seleção" onMouseDown={(event) => event.preventDefault()} onClick={clearTableSelection}><X size={12} /></button></span>}
          <select aria-label="Estilo da tabela" value={tableStyle} onMouseDown={(event) => event.preventDefault()} onChange={(event) => applyTableStyle(event.target.value)}>{TABLE_STYLES.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}</select>
          <button type="button" title="Alternar cabeçalho" aria-label="Alternar cabeçalho" onMouseDown={(event) => event.preventDefault()} onClick={toggleTableHeader}><Table2 size={15} /></button>
          <button type="button" title="Alinhar célula à esquerda" aria-label="Alinhar célula à esquerda" onMouseDown={(event) => event.preventDefault()} onClick={() => setCellAlignment("left")}><AlignLeft size={15} /></button>
          <button type="button" title="Centralizar célula" aria-label="Centralizar célula" onMouseDown={(event) => event.preventDefault()} onClick={() => setCellAlignment("center")}><AlignCenter size={15} /></button>
          <button type="button" title="Alinhar célula à direita" aria-label="Alinhar célula à direita" onMouseDown={(event) => event.preventDefault()} onClick={() => setCellAlignment("right")}><AlignRight size={15} /></button>
          <button type="button" title="Adicionar linha abaixo" aria-label="Adicionar linha abaixo" onMouseDown={(event) => event.preventDefault()} onClick={insertTableRow}><Rows3 size={15} /></button>
          <button type="button" title="Remover linha" aria-label="Remover linha" onMouseDown={(event) => event.preventDefault()} onClick={deleteTableRow}><Rows3 size={15} /><Trash2 size={11} /></button>
          <button type="button" title="Adicionar coluna ao lado" aria-label="Adicionar coluna ao lado" onMouseDown={(event) => event.preventDefault()} onClick={insertTableColumn}><Columns3 size={15} /></button>
          <button type="button" title="Remover coluna" aria-label="Remover coluna" onMouseDown={(event) => event.preventDefault()} onClick={deleteTableColumn}><Columns3 size={15} /><Trash2 size={11} /></button>
        </div>}
        <input ref={imageInputRef} hidden type="file" accept="image/*" onChange={(event) => { void insertImage(event.target.files?.[0]); event.currentTarget.value = "" }} />
      </div>
      <div className="rich-text-content-wrap" ref={wrapRef}>
        <div
          ref={editorRef}
          className="rich-text-content"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-labelledby={`${id}-label`}
          suppressContentEditableWarning
          onClick={(event) => {
            const selectedImage = event.target instanceof HTMLImageElement ? event.target : null
            selectedImageRef.current = selectedImage
            setImageSelected(Boolean(selectedImage))
            if (selectedImage) {
              setImageWidth(Number(selectedImage.dataset.width) || 75)
              setImageAlign(selectedImage.dataset.align === "left" || selectedImage.dataset.align === "right" ? selectedImage.dataset.align : "center")
            }
            updateTableContext()
          }}
          onInput={handleEditorInput}
          onKeyDown={(event) => {
            // Esc aqui só deve fechar a sugestão de link; sem isso, o mesmo
            // Esc também fecharia o modal que contém o editor.
            if (event.key === "Escape") {
              if (wikiQuery !== null) { event.stopPropagation(); setWikiQuery(null) }
              return
            }
            if (event.key === "Enter" && wikiQuery !== null && suggestedWikiTitles[0]) {
              event.preventDefault()
              insertWikiLink(suggestedWikiTitles[0])
            }
          }}
          onKeyUp={() => { updateWikiSuggestions(); updateTableContext() }}
          onBlur={() => emitCurrentValue(true)}
        />
        {tableHandles && <div className="rt-table-handles" aria-label="Selecionar linhas e colunas da tabela">
          {tableHandles.rows.map((row) => <button key={`row-${row.index}`} type="button" className={`rt-row-handle ${selectedRows.includes(row.index) ? "active" : ""}`} style={{ left: tableHandles.tableLeft, top: row.top, height: row.height }} title={`Selecionar linha ${row.index + 1}`} aria-label={`Selecionar linha ${row.index + 1}`} onMouseDown={(event) => toggleRowSelection(row.index, event)} />)}
          {tableHandles.cols.map((col) => <button key={`col-${col.index}`} type="button" className={`rt-col-handle ${selectedCols.includes(col.index) ? "active" : ""}`} style={{ left: col.left, top: tableHandles.tableTop, width: col.width }} title={`Selecionar coluna ${col.index + 1}`} aria-label={`Selecionar coluna ${col.index + 1}`} onMouseDown={(event) => toggleColSelection(col.index, event)} />)}
        </div>}
      </div>
      {wikiQuery !== null && <div className="wiki-link-suggestions" role="listbox" aria-label="Páginas para vincular">
        <header><strong>Vincular página</strong><span>Digite o nome ou escolha abaixo</span></header>
        {suggestedWikiTitles.length > 0
          ? suggestedWikiTitles.map((title, index) => <button key={`${title}-${index}`} type="button" role="option" aria-selected={index === 0} onMouseDown={(event) => event.preventDefault()} onClick={() => insertWikiLink(title)}>{title}</button>)
          : <p>{wikiQuery.trim() ? <>Continue e feche com <kbd>]]</kbd> para criar “{wikiQuery.trim()}”.</> : "Ainda não há outra página nesta área."}</p>}
      </div>}
    </div>
  </div>
}
