"use client"

import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent } from "react"
import { AlignCenter, AlignLeft, AlignRight, Bold, Eraser, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Underline, Unlink } from "lucide-react"
import { readCachedVaultAsset } from "../lib/vault-assets"
import type { KnowledgePage } from "../lib/knowledge-model"

const allowedTags = new Set(["P", "DIV", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "A", "IMG", "HR", "CODE", "PRE"])

function safeImageSource(value: string): boolean {
  return value.startsWith("data:image/") || value.startsWith("blob:") || (value.startsWith("/") && !value.startsWith("//"))
}

export function sanitizeRichText(value: string): string {
  if (typeof DOMParser === "undefined") return value
  const documentValue = new DOMParser().parseFromString(value, "text/html")
  for (const element of [...documentValue.body.querySelectorAll("*")]) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes)
      continue
    }
    for (const attribute of [...element.attributes]) {
      const keepLink = element.tagName === "A" && (
        (attribute.name === "href" && /^(https:|obsidian:|#)/i.test(attribute.value))
        || (attribute.name === "data-wiki-title" && Boolean(attribute.value.trim()))
      )
      const keepImageStyle = attribute.name === "style" && /^width:\s*(?:100|[2-9]\d)%\s*;?$/i.test(attribute.value)
      const keepImage = element.tagName === "IMG" && ((attribute.name === "src" && safeImageSource(attribute.value)) || attribute.name === "alt" || attribute.name === "data-align" || attribute.name === "data-width" || attribute.name === "data-obsidian-path" || keepImageStyle)
      if (!keepLink && !keepImage) element.removeAttribute(attribute.name)
    }
    if (element.tagName === "A") {
      if (element.hasAttribute("data-wiki-title")) {
        element.removeAttribute("target")
        element.removeAttribute("rel")
      } else {
        element.setAttribute("target", "_blank")
        element.setAttribute("rel", "noreferrer")
      }
    }
  }
  if (!documentValue.body.textContent?.trim() && !documentValue.body.querySelector("img, hr")) return ""
  return documentValue.body.innerHTML
}

export function wikiTitlesFromRichText(value: string): string[] {
  if (typeof DOMParser === "undefined") return []
  const documentValue = new DOMParser().parseFromString(value, "text/html")
  return [...documentValue.querySelectorAll<HTMLAnchorElement>("a[data-wiki-title]")]
    .map((anchor) => anchor.dataset.wikiTitle?.trim() ?? "")
    .filter(Boolean)
}

/**
 * Leitura do mesmo HTML que o editor grava. Reaproveita a sanitização e a
 * resolução de anexos do vault para que uma página exibida fora do editor
 * (como um evento dentro de uma História) apareça exatamente igual.
 */
export function RichTextView({ html, className = "", pages = [], onOpenPage }: { html: string; className?: string; pages?: KnowledgePage[]; onOpenPage?: (page: KnowledgePage) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredPage, setHoveredPage] = useState<KnowledgePage | null>(null)
  const safe = useMemo(() => sanitizeRichText(html), [html])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    const objectUrls: string[] = []
    void Promise.all([...container.querySelectorAll<HTMLImageElement>("img[data-obsidian-path]")].map(async (image) => {
      const path = image.dataset.obsidianPath?.trim()
      if (!path) return
      const content = await readCachedVaultAsset(path)
      if (!content || cancelled) return
      const url = URL.createObjectURL(content)
      objectUrls.push(url)
      image.src = url
    }))
    return () => {
      cancelled = true
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [safe])

  function resolve(anchor: HTMLAnchorElement): KnowledgePage | undefined {
    const title = anchor.dataset.wikiTitle?.trim().toLocaleLowerCase("pt-BR")
    return title ? pages.find((page) => page.title.trim().toLocaleLowerCase("pt-BR") === title) : undefined
  }
  return <div ref={containerRef} className={`rich-text-content rich-text-view ${className}`} onClick={(event) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-wiki-title]")
    const page = anchor && resolve(anchor)
    if (page && onOpenPage) { event.preventDefault(); onOpenPage(page) }
  }} onMouseOver={(event) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-wiki-title]")
    if (anchor && event.altKey) setHoveredPage(resolve(anchor) ?? null)
  }} onMouseMove={(event) => {
    if (!event.altKey) { setHoveredPage(null); return }
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-wiki-title]")
    if (anchor) setHoveredPage(resolve(anchor) ?? null)
  }} onMouseLeave={() => setHoveredPage(null)}><div dangerouslySetInnerHTML={{ __html: safe }} />{hoveredPage && <aside className="wiki-link-preview"><strong>{hoveredPage.title}</strong><div dangerouslySetInnerHTML={{ __html: sanitizeRichText(hoveredPage.contentHtml) }} /></aside>}</div>
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
  const imageInputRef = useRef<HTMLInputElement>(null)
  const selectedImageRef = useRef<HTMLImageElement | null>(null)
  const wikiRangeRef = useRef<Range | null>(null)
  const lastEmittedValueRef = useRef("")
  const vaultImageUrlsRef = useRef<string[]>([])
  const [imageSelected, setImageSelected] = useState(false)
  const [imageWidth, setImageWidth] = useState(25)
  const [imageAlign, setImageAlign] = useState<"left" | "center" | "right">("left")
  const [wikiQuery, setWikiQuery] = useState<string | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const safe = sanitizeRichText(value)
    if (safe !== lastEmittedValueRef.current) {
      vaultImageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      vaultImageUrlsRef.current = []
      if (editor.innerHTML !== safe) editor.innerHTML = safe
      lastEmittedValueRef.current = safe
    }
    let cancelled = false
    const images = [...editor.querySelectorAll<HTMLImageElement>("img[data-obsidian-path]")]
    void Promise.all(images.map(async (image) => {
      const path = image.dataset.obsidianPath?.trim()
      if (!path || (image.src && !image.src.startsWith(window.location.origin))) return
      const content = await readCachedVaultAsset(path)
      if (!content || cancelled) return
      const url = URL.createObjectURL(content)
      vaultImageUrlsRef.current.push(url)
      image.src = url
    }))
    return () => {
      cancelled = true
    }
  }, [value])

  useEffect(() => () => {
    vaultImageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    vaultImageUrlsRef.current = []
  }, [])

  function emitCurrentValue(normalizeDom = false) {
    const editor = editorRef.current
    if (!editor) return
    // Navegadores deixam o texto inicial como nó direto e usam DIV ao pressionar
    // Enter; isso cria um espaçamento diferente na primeira linha. Normalizamos
    // os blocos antes de salvar para que cada linha use o mesmo elemento.
    for (const node of [...editor.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        const paragraph = document.createElement("p")
        paragraph.textContent = node.textContent
        node.replaceWith(paragraph)
      }
    }
    const serializable = editor.cloneNode(true) as HTMLDivElement
    serializable.querySelectorAll<HTMLImageElement>("img[data-obsidian-path]").forEach((image) => image.removeAttribute("src"))
    const safe = sanitizeRichText(serializable.innerHTML)
    lastEmittedValueRef.current = safe
    if (normalizeDom && sanitizeRichText(editor.innerHTML) !== safe) {
      // URLs blob são apenas uma projeção local da imagem em cache e não entram no estado/D1.
      const current = editor.innerHTML
      if (!current.includes("blob:")) editor.innerHTML = safe
    }
    onChange(safe)
  }

  function command(name: string, argument?: string) {
    editorRef.current?.focus()
    document.execCommand(name, false, argument)
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
    const spacer = document.createTextNode("\u00a0")
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
    const spacer = document.createTextNode("\u00a0")
    range.insertNode(spacer)
    range.insertNode(anchor)
    placeCaretAfter(spacer)
    setWikiQuery(null)
    wikiRangeRef.current = null
    emitCurrentValue()
  }

  function handleEditorInput() {
    convertCompletedWikiLink()
    updateWikiSuggestions()
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
      inserted.dataset.width = "25"
      inserted.dataset.align = "left"
      inserted.style.width = "25%"
      selectedImageRef.current = inserted
      setImageSelected(true)
      setImageWidth(25)
      setImageAlign("left")
    }
    emitCurrentValue()
  }

  /**
   * Colar uma imagem precisa produzir um anexo de verdade. A colagem padrão
   * do `contenteditable` insere `<img src="https://…">`, que a sanitização
   * (e o próprio `img-src` da CSP) descarta — é daí que vinha a imagem
   * quebrada. Com o arquivo da área de transferência em mãos, o mesmo
   * caminho do botão "Inserir imagem" é usado: a imagem entra como `data:`,
   * e a sincronização grava o arquivo em `Assets` do vault, trocando o
   * conteúdo por `![[imagem.jpg]]` no Markdown.
   */
  async function pasteContent(event: ClipboardEvent<HTMLDivElement>) {
    const files = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"))
    if (files.length > 0) {
      event.preventDefault()
      for (const file of files) await insertImage(file)
      return
    }
    const html = event.clipboardData.getData("text/html")
    if (!/<img\b/i.test(html)) return
    // Sem o binário na área de transferência, a imagem remota não pode ser
    // baixada (a CSP restringe `connect-src` ao próprio site) nem exibida.
    // Em vez de deixar um quadro quebrado, cola o endereço como link.
    event.preventDefault()
    const source = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? ""
    const text = event.clipboardData.getData("text/plain").trim()
    editorRef.current?.focus()
    if (/^https:/i.test(source)) document.execCommand("insertHTML", false, `<a href="${source.replaceAll('"', "&quot;")}" target="_blank" rel="noreferrer">${text || source}</a>`)
    else if (text) document.execCommand("insertText", false, text)
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

  const tools = [
    { label: "Negrito", icon: Bold, command: "bold" },
    { label: "Itálico", icon: Italic, command: "italic" },
    { label: "Sublinhado", icon: Underline, command: "underline" },
    { label: "Lista", icon: List, command: "insertUnorderedList" },
    { label: "Lista numerada", icon: ListOrdered, command: "insertOrderedList" },
    { label: "Título", icon: Heading2, command: "formatBlock", argument: "H2" },
    { label: "Citação", icon: Quote, command: "formatBlock", argument: "BLOCKQUOTE" },
    { label: "Limpar formatação", icon: Eraser, command: "removeFormat" },
  ]
  const suggestedWikiTitles = wikiQuery === null ? [] : wikiPageTitles
    .filter((title) => title.toLocaleLowerCase("pt-BR").includes(wikiQuery.trim().toLocaleLowerCase("pt-BR")))
    .slice(0, 8)

  return <div className={`rich-text-field ${className}`}>
    <span id={`${id}-label`}>{label}</span>
    <div className="rich-text-shell">
      <div className="rich-text-toolbar">
        {tools.map(({ label: toolLabel, icon: Icon, command: toolCommand, argument }) => <button key={toolLabel} type="button" title={toolLabel} aria-label={toolLabel} onMouseDown={(event) => event.preventDefault()} onClick={() => command(toolCommand, argument)}><Icon size={15} /></button>)}
        <i />
        <button type="button" title="Inserir link" aria-label="Inserir link" onMouseDown={(event) => event.preventDefault()} onClick={createLink}><Link2 size={15} /></button>
        <button type="button" title="Remover link" aria-label="Remover link" onMouseDown={(event) => event.preventDefault()} onClick={() => command("unlink")}><Unlink size={15} /></button>
        <button type="button" title="Inserir imagem" aria-label="Inserir imagem" onClick={() => imageInputRef.current?.click()}><ImagePlus size={15} /></button>
        {imageSelected && <div className="rich-text-image-tools" aria-label="Formatação da imagem">
          <i />
          <button type="button" aria-pressed={imageAlign === "left"} title="Alinhar à esquerda e envolver com texto" aria-label="Alinhar imagem à esquerda e envolver com texto" onClick={() => formatImage(imageWidth, "left")}><AlignLeft size={15} /></button>
          <button type="button" aria-pressed={imageAlign === "center"} title="Centralizar imagem" aria-label="Centralizar imagem" onClick={() => formatImage(imageWidth, "center")}><AlignCenter size={15} /></button>
          <button type="button" aria-pressed={imageAlign === "right"} title="Alinhar à direita e envolver com texto" aria-label="Alinhar imagem à direita e envolver com texto" onClick={() => formatImage(imageWidth, "right")}><AlignRight size={15} /></button>
          <label className="rich-text-image-size"><span>Tamanho</span><input aria-label="Tamanho da imagem em porcentagem" type="range" min="20" max="100" step="5" value={imageWidth} onChange={(event) => formatImage(Number(event.target.value), imageAlign)} /><output>{imageWidth}%</output></label>
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
        onPaste={(event) => { void pasteContent(event) }}
        onClick={(event) => {
          const selectedImage = event.target instanceof HTMLImageElement ? event.target : null
          selectedImageRef.current = selectedImage
          setImageSelected(Boolean(selectedImage))
          if (selectedImage) {
            setImageWidth(Number(selectedImage.dataset.width) || 25)
            setImageAlign(selectedImage.dataset.align === "center" || selectedImage.dataset.align === "right" ? selectedImage.dataset.align : "left")
          }
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
        onKeyUp={() => updateWikiSuggestions()}
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
