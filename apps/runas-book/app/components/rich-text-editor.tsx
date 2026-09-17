"use client"

import { useEffect, useId, useRef, useState } from "react"
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Columns3, Eraser, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Rows3, Strikethrough, Table2, Trash2, Underline, Unlink } from "lucide-react"
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
  const imageInputRef = useRef<HTMLInputElement>(null)
  const selectedImageRef = useRef<HTMLImageElement | null>(null)
  const wikiRangeRef = useRef<Range | null>(null)
  const lastEmittedValueRef = useRef("")
  const [imageSelected, setImageSelected] = useState(false)
  const [imageWidth, setImageWidth] = useState(75)
  const [imageAlign, setImageAlign] = useState<"left" | "center" | "right">("center")
  const [insideTable, setInsideTable] = useState(false)
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

  function updateTableContext() {
    const selection = window.getSelection()
    const node = selection?.anchorNode
    const element = node instanceof HTMLElement ? node : node?.parentElement
    setInsideTable(Boolean(element?.closest("td, th")))
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
    const cell = element?.closest("td, th") as HTMLTableCellElement | null
    const row = cell?.closest("tr") ?? null
    const table = cell?.closest("table") ?? null
    if (!cell || !row || !table || !editorRef.current?.contains(table)) return null
    return { table, row, cell }
  }

  function insertTable() {
    const rowsInput = window.prompt("Quantas linhas (além do cabeçalho)?", "2")
    if (rowsInput === null) return
    const colsInput = window.prompt("Quantas colunas?", "3")
    if (colsInput === null) return
    const rows = Math.max(1, Math.min(20, Math.trunc(Number(rowsInput)) || 1))
    const cols = Math.max(1, Math.min(10, Math.trunc(Number(colsInput)) || 1))
    const headerCells = Array.from({ length: cols }, () => "<th>&nbsp;</th>").join("")
    const bodyRow = `<tr>${Array.from({ length: cols }, () => "<td>&nbsp;</td>").join("")}</tr>`
    const html = `<table><thead><tr>${headerCells}</tr></thead><tbody>${Array.from({ length: rows }, () => bodyRow).join("")}</tbody></table><p><br></p>`
    editorRef.current?.focus()
    document.execCommand("insertHTML", false, html)
    emitCurrentValue()
  }

  function insertTableRow() {
    const context = tableContext()
    if (!context) return
    const newRow = context.row.cloneNode(true) as HTMLTableRowElement
    newRow.querySelectorAll("td, th").forEach((cell) => { cell.innerHTML = "&nbsp;" })
    context.row.after(newRow)
    emitCurrentValue()
  }

  function deleteTableRow() {
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
    emitCurrentValue()
  }

  function deleteTableColumn() {
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
        <button type="button" title="Inserir tabela" aria-label="Inserir tabela" onMouseDown={(event) => event.preventDefault()} onClick={insertTable}><Table2 size={15} /></button>
        {imageSelected && <div className="rich-text-image-tools" aria-label="Formatação da imagem">
          <i />
          <button type="button" aria-pressed={imageAlign === "left"} title="Alinhar à esquerda e envolver com texto" aria-label="Alinhar imagem à esquerda e envolver com texto" onClick={() => formatImage(imageWidth, "left")}><AlignLeft size={15} /></button>
          <button type="button" aria-pressed={imageAlign === "center"} title="Centralizar imagem" aria-label="Centralizar imagem" onClick={() => formatImage(imageWidth, "center")}><AlignCenter size={15} /></button>
          <button type="button" aria-pressed={imageAlign === "right"} title="Alinhar à direita e envolver com texto" aria-label="Alinhar imagem à direita e envolver com texto" onClick={() => formatImage(imageWidth, "right")}><AlignRight size={15} /></button>
          <label className="rich-text-image-size"><span>Tamanho</span><input aria-label="Tamanho da imagem em porcentagem" type="range" min="20" max="100" step="5" value={imageWidth} onChange={(event) => formatImage(Number(event.target.value), imageAlign)} /><output>{imageWidth}%</output></label>
        </div>}
        {insideTable && <div className="rich-text-image-tools" aria-label="Edição de tabela">
          <i />
          <button type="button" title="Adicionar linha abaixo" aria-label="Adicionar linha abaixo" onMouseDown={(event) => event.preventDefault()} onClick={insertTableRow}><Rows3 size={15} /></button>
          <button type="button" title="Remover linha" aria-label="Remover linha" onMouseDown={(event) => event.preventDefault()} onClick={deleteTableRow}><Rows3 size={15} /><Trash2 size={11} /></button>
          <button type="button" title="Adicionar coluna ao lado" aria-label="Adicionar coluna ao lado" onMouseDown={(event) => event.preventDefault()} onClick={insertTableColumn}><Columns3 size={15} /></button>
          <button type="button" title="Remover coluna" aria-label="Remover coluna" onMouseDown={(event) => event.preventDefault()} onClick={deleteTableColumn}><Columns3 size={15} /><Trash2 size={11} /></button>
        </div>}
        <input ref={imageInputRef} hidden type="file" accept="image/*" onChange={(event) => { void insertImage(event.target.files?.[0]); event.currentTarget.value = "" }} />
      </div>
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
      {wikiQuery !== null && <div className="wiki-link-suggestions" role="listbox" aria-label="Páginas para vincular">
        <header><strong>Vincular página</strong><span>Digite o nome ou escolha abaixo</span></header>
        {suggestedWikiTitles.length > 0
          ? suggestedWikiTitles.map((title, index) => <button key={`${title}-${index}`} type="button" role="option" aria-selected={index === 0} onMouseDown={(event) => event.preventDefault()} onClick={() => insertWikiLink(title)}>{title}</button>)
          : <p>{wikiQuery.trim() ? <>Continue e feche com <kbd>]]</kbd> para criar “{wikiQuery.trim()}”.</> : "Ainda não há outra página nesta área."}</p>}
      </div>}
    </div>
  </div>
}
