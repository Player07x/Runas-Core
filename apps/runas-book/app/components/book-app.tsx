"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react"
import { BookPlus, Check, ChevronRight, Download, ExternalLink, FileStack, FileText, FileType2, FolderInput, KeyRound, Library, Loader2, LockKeyhole, Menu, Plus, Search, Settings, ShieldCheck, Sparkles, Trash2, Upload, WandSparkles, X } from "lucide-react"
import { RuneMark } from "./rune-mark"
import { allEntries, applyLegacyContent, findEntry, legacyContentRequests, normalizeWorkspace, plainTextFromHtml, slugify, type BookChapter, type BookCustomPage, type BookEntry, type BookEntryKind, type BookRecord, type BookResource, type BookWorkspace } from "../lib/book-model"
import { BOOK_PENDING_ATTRIBUTE, BOOK_STORAGE_KEY } from "../lib/book-view-bootstrap"
import { useDeferredLocalStorage } from "../lib/use-deferred-local-storage"
import { BookSidebar } from "./book-sidebar"
import { PageView } from "./page-view"
import { ResourceEditorDialog } from "./resource-panel"

// Editores e diálogos da área DM ficam fora do pacote inicial da leitura.
const loadPageEditor = () => import("./page-editor")
const loadBookSettingsDialog = () => import("./book-settings-dialog")
const loadCustomPagesEditor = () => import("./custom-pages-editor")

const PageEditor = dynamic(() => loadPageEditor().then((module) => module.PageEditor), { ssr: false, loading: () => <article className="page-article page-editor"><p className="page-copy-empty"><Loader2 size={15} className="spin" /> Abrindo o editor…</p></article> })
const BookSettingsDialog = dynamic(() => loadBookSettingsDialog().then((module) => module.BookSettingsDialog), { ssr: false, loading: () => <LoadingModal /> })
const CustomPagesEditor = dynamic(() => loadCustomPagesEditor().then((module) => module.CustomPagesEditor), { ssr: false, loading: () => <LoadingModal /> })

const STORAGE_KEY = BOOK_STORAGE_KEY
const AUTH_KEY = "runas-book.authenticated"
type Mode = "public" | "dm"
type NavMode = "topic" | "page" | "edit"

interface Nav { bookId: string | null; chapterId: string | null; entryId: string | null; mode: NavMode }

type IdleWindow = Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (handle: number) => void }

/** Executa `callback` quando o navegador estiver ocioso; devolve a função de cancelamento. */
function whenIdle(callback: () => void, timeout = 3000): () => void {
  const idleWindow = window as IdleWindow
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }
  const handle = window.setTimeout(callback, 200)
  return () => window.clearTimeout(handle)
}

/** A tela estática mostra o primeiro tópico do primeiro livro; a navegação inicial parte do mesmo ponto. */
function defaultNav(workspace: BookWorkspace): Nav {
  const firstBook = workspace.books[0]
  return { bookId: firstBook?.id ?? null, chapterId: firstBook?.chapters[0]?.id ?? null, entryId: null, mode: "topic" }
}

function LoadingModal() {
  return <div className="modal-backdrop"><section className="modal-card modal-loading" aria-busy="true"><Loader2 size={20} className="spin" /></section></div>
}

function serializeHash(nav: Nav): string {
  if (!nav.bookId) return "#/"
  const parts = [nav.bookId, nav.chapterId, nav.entryId].filter((value): value is string => Boolean(value))
  let hash = `#/${parts.map(encodeURIComponent).join("/")}`
  if (nav.mode === "edit" && nav.entryId) hash += "/edit"
  return hash
}

function parseHash(hash: string): Nav | null {
  const clean = hash.replace(/^#\/?/, "")
  if (!clean) return null
  const parts = clean.split("/").filter(Boolean).map(decodeURIComponent)
  const isEdit = parts[parts.length - 1] === "edit"
  if (isEdit) parts.pop()
  const [bookId, chapterId, entryId] = parts
  if (!bookId) return null
  return { bookId, chapterId: chapterId ?? null, entryId: entryId ?? null, mode: isEdit ? "edit" : entryId ? "page" : "topic" }
}

export function BookApp({ mode, seed }: { mode: Mode; seed: BookWorkspace }) {
  const [workspace, setWorkspace] = useState<BookWorkspace>(seed)
  const [hydrated, setHydrated] = useState(false)
  const [authenticated, setAuthenticated] = useState(mode === "public")
  const [authChecking, setAuthChecking] = useState(mode === "dm")
  const [authError, setAuthError] = useState("")
  const [token, setToken] = useState("")
  const [password, setPassword] = useState("")
  const [nav, setNav] = useState<Nav>(() => defaultNav(seed))
  const [navReady, setNavReady] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [showBooks, setShowBooks] = useState(false)
  const [showChapterEditor, setShowChapterEditor] = useState(false)
  const [showNewPage, setShowNewPage] = useState(false)
  const [newBookTitle, setNewBookTitle] = useState("")
  const [newChapterTitle, setNewChapterTitle] = useState("")
  const [newPageTitle, setNewPageTitle] = useState("")
  const [newPageKind, setNewPageKind] = useState<BookEntryKind>("rule")
  const [pendingNewEntryId, setPendingNewEntryId] = useState<string | null>(null)
  const [quickEditResource, setQuickEditResource] = useState<BookResource | null>(null)
  const [notice, setNotice] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showBookSettings, setShowBookSettings] = useState(false)
  const [showCustomPages, setShowCustomPages] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)

  useEffect(() => {
    let saved: BookWorkspace | null = null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) saved = normalizeWorkspace(JSON.parse(raw), seed)
    } catch { /* dados corrompidos voltam ao catálogo inicial */ }
    if (saved) setWorkspace(saved)
    setHydrated(true)

    // Páginas salvas sem conteúdo são preenchidas pela fonte do livro, carregada só nesse caso.
    const requests = saved ? legacyContentRequests(saved) : []
    if (requests.length === 0) return
    let active = true
    const cancelIdle = whenIdle(() => {
      void import("../lib/legacy-content")
        .then(({ resolveLegacyContent }) => resolveLegacyContent(requests))
        .then((contents) => { if (active && contents.size > 0) setWorkspace((current) => applyLegacyContent(current, contents)) })
        .catch(() => { /* sem a fonte, a página segue vazia como uma página nova */ })
    })
    return () => { active = false; cancelIdle() }
  }, [seed])

  const reportStorageError = useCallback(() => setNotice("Não foi possível salvar no armazenamento deste navegador."), [])
  useDeferredLocalStorage(STORAGE_KEY, workspace, hydrated, reportStorageError)

  useLayoutEffect(() => {
    if (navReady) document.documentElement.removeAttribute(BOOK_PENDING_ATTRIBUTE)
  }, [navReady])

  useEffect(() => {
    if (mode !== "dm" || !authenticated) return
    return whenIdle(() => { void loadPageEditor(); void loadBookSettingsDialog(); void loadCustomPagesEditor() })
  }, [mode, authenticated])

  useEffect(() => {
    if (mode !== "dm") return
    const recent = sessionStorage.getItem(AUTH_KEY) === "yes"
    const timer = window.setTimeout(() => { setAuthenticated(recent); setAuthChecking(false) }, 0)
    return () => window.clearTimeout(timer)
  }, [mode])

  useEffect(() => {
    if (!hydrated || navReady) return
    const fromHash = parseHash(window.location.hash)
    const fallbackBookId = workspace.selectedBookId && workspace.books.some((book) => book.id === workspace.selectedBookId) ? workspace.selectedBookId : workspace.books[0]?.id ?? null
    if (fromHash && workspace.books.some((book) => book.id === fromHash.bookId)) {
      setNav(fromHash)
      if (fromHash.chapterId) setExpanded((current) => new Set(current).add(fromHash.chapterId!))
    } else if (fallbackBookId) {
      const book = workspace.books.find((item) => item.id === fallbackBookId)!
      setNav({ bookId: fallbackBookId, chapterId: book.chapters[0]?.id ?? null, entryId: null, mode: "topic" })
    }
    setNavReady(true)
  }, [hydrated, navReady, workspace.books, workspace.selectedBookId])

  useEffect(() => {
    if (!navReady) return
    const nextHash = serializeHash(nav)
    if (window.location.hash !== nextHash) window.history.replaceState(null, "", nextHash)
  }, [nav, navReady])

  useEffect(() => {
    function onHashChange() {
      const parsed = parseHash(window.location.hash)
      if (!parsed || !workspace.books.some((book) => book.id === parsed.bookId)) return
      setNav(parsed)
      if (parsed.chapterId) setExpanded((current) => new Set(current).add(parsed.chapterId!))
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [workspace.books])

  const book = workspace.books.find((item) => item.id === nav.bookId) ?? workspace.books[0]
  const found = book && nav.entryId ? findEntry(book, nav.entryId) : null
  const chapter = found?.chapter ?? book?.chapters.find((item) => item.id === nav.chapterId) ?? book?.chapters[0]
  const entry = found?.entry ?? null
  const isDm = mode === "dm"

  // Texto de busca de cada página do tópico, preparado uma vez em vez de a cada tecla.
  const chapterSearchIndex = useMemo(() => chapter
    ? chapter.entries.map((candidate) => ({ entry: candidate, text: [candidate.title, candidate.summary, plainTextFromHtml(candidate.content)].join(" ").toLocaleLowerCase("pt-BR") }))
    : [], [chapter])
  const visibleEntries = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR")
    return chapterSearchIndex.filter((candidate) => !term || candidate.text.includes(term)).map((candidate) => candidate.entry)
  }, [chapterSearchIndex, query])
  const pageTitles = useMemo(() => book ? allEntries(book).filter((candidate) => candidate.id !== entry?.id).map((candidate) => candidate.title) : [], [book, entry])

  function goToBooks() { setShowBooks(true) }
  function selectBook(nextId: string) {
    const nextBook = workspace.books.find((item) => item.id === nextId)
    setNav({ bookId: nextId, chapterId: nextBook?.chapters[0]?.id ?? null, entryId: null, mode: "topic" })
    setShowBooks(false); setQuery("")
    setWorkspace((current) => ({ ...current, selectedBookId: nextId, updatedAt: Date.now() }))
  }
  const toggleChapter = useCallback((chapterId: string) => {
    setExpanded((current) => { const next = new Set(current); if (next.has(chapterId)) next.delete(chapterId); else next.add(chapterId); return next })
  }, [])
  const openTopic = useCallback((chapterId: string) => {
    setNav((current) => ({ ...current, chapterId, entryId: null, mode: "topic" })); setQuery("")
    setExpanded((current) => new Set(current).add(chapterId))
    setSidebarOpen(false)
  }, [])
  const openEntry = useCallback((chapterId: string, entryId: string) => {
    setNav((current) => ({ ...current, chapterId, entryId, mode: "page" }))
    setExpanded((current) => new Set(current).add(chapterId))
    setSidebarOpen(false)
  }, [])
  const openChapterEditor = useCallback(() => setShowChapterEditor(true), [])
  function openEdit() {
    if (!nav.entryId) return
    setNav((current) => ({ ...current, mode: "edit" }))
  }

  function addBook() {
    const title = newBookTitle.trim()
    if (!title) return
    const id = `book-${slugify(title)}-${Date.now().toString(36)}`
    const next: BookRecord = { id, title, subtitle: "Livro personalizado", accent: "#cfd6d1", author: "", customPages: [], sourceFile: "", chapters: [] }
    setWorkspace((current) => ({ ...current, books: [...current.books, next], selectedBookId: id, updatedAt: Date.now() }))
    setNav({ bookId: id, chapterId: null, entryId: null, mode: "topic" })
    setNewBookTitle(""); setShowBooks(false); setNotice("Livro criado")
  }

  function removeBook(bookId: string) {
    const target = workspace.books.find((item) => item.id === bookId)
    if (!target) return
    if (workspace.books.length <= 1) { setNotice("Não é possível excluir o único livro."); return }
    const pageCount = target.chapters.reduce((count, item) => count + item.entries.length, 0)
    const confirmMessage = pageCount > 0
      ? `Excluir o livro "${target.title}" e ${target.chapters.length === 1 ? "seu tópico" : `seus ${target.chapters.length} tópicos`} (${pageCount} ${pageCount === 1 ? "página" : "páginas"})? Essa ação não pode ser desfeita.`
      : `Excluir o livro "${target.title}"? Essa ação não pode ser desfeita.`
    if (!window.confirm(confirmMessage)) return
    const remaining = workspace.books.filter((item) => item.id !== bookId)
    const fallbackId = remaining[0]?.id ?? null
    setWorkspace((current) => ({
      ...current,
      books: current.books.filter((item) => item.id !== bookId),
      selectedBookId: current.selectedBookId === bookId ? fallbackId : current.selectedBookId,
      updatedAt: Date.now(),
    }))
    if (nav.bookId === bookId) {
      const fallbackBook = remaining[0]
      setNav({ bookId: fallbackId, chapterId: fallbackBook?.chapters[0]?.id ?? null, entryId: null, mode: "topic" })
    }
    setNotice("Livro excluído")
  }

  function addChapter() {
    if (!book) return
    const title = newChapterTitle.trim()
    if (!title) return
    const id = `${book.id}-chapter-${Date.now().toString(36)}`
    const next: BookChapter = { id, title, summary: "", bookId: book.id, order: book.chapters.length + 1, entries: [] }
    setWorkspace((current) => ({ ...current, books: current.books.map((item) => item.id === book.id ? { ...item, chapters: [...item.chapters, next] } : item), updatedAt: Date.now() }))
    setNewChapterTitle(""); setShowChapterEditor(false); setNotice("Tópico criado")
    openTopic(id)
  }

  const activeChapterId = nav.chapterId
  const removeChapter = useCallback((chapterId: string) => {
    if (!book) return
    const target = book.chapters.find((item) => item.id === chapterId)
    if (!target) return
    const pageCount = target.entries.length
    const confirmMessage = pageCount > 0
      ? `Excluir o tópico "${target.title}" e ${pageCount === 1 ? "a página dele" : `as ${pageCount} páginas dele`}? Essa ação não pode ser desfeita.`
      : `Excluir o tópico "${target.title}"? Essa ação não pode ser desfeita.`
    if (!window.confirm(confirmMessage)) return
    const remainingChapters = book.chapters.filter((item) => item.id !== chapterId)
    setWorkspace((current) => ({ ...current, books: current.books.map((item) => item.id === book.id ? { ...item, chapters: item.chapters.filter((chapterItem) => chapterItem.id !== chapterId) } : item), updatedAt: Date.now() }))
    setExpanded((current) => { const next = new Set(current); next.delete(chapterId); return next })
    if (activeChapterId === chapterId) {
      const fallback = remainingChapters[0]
      setNav({ bookId: book.id, chapterId: fallback?.id ?? null, entryId: null, mode: "topic" })
    }
    setNotice("Tópico excluído")
  }, [book, activeChapterId])

  const openNewPage = useCallback((chapterId: string) => {
    setNav((current) => ({ ...current, chapterId }))
    setNewPageTitle(""); setNewPageKind("rule"); setShowNewPage(true)
  }, [])

  function createPage() {
    if (!book || !nav.chapterId) return
    const title = newPageTitle.trim()
    if (!title) return
    const chapterId = nav.chapterId
    const id = `${chapterId}-entry-${Date.now().toString(36)}`
    const next: BookEntry = { id, chapterId, title, kind: newPageKind, summary: "", content: "", tags: [], entity: null, resources: [], updatedAt: Date.now() }
    setWorkspace((current) => ({ ...current, books: current.books.map((item) => item.id === book.id ? { ...item, chapters: item.chapters.map((current) => current.id === chapterId ? { ...current, entries: [...current.entries, next] } : current) } : item), updatedAt: Date.now() }))
    setPendingNewEntryId(id)
    setShowNewPage(false)
    setNav({ bookId: book.id, chapterId, entryId: id, mode: "edit" })
  }

  function saveEntry(nextEntry: BookEntry) {
    if (!book) return
    setWorkspace((current) => ({ ...current, books: current.books.map((item) => item.id === book.id ? { ...item, chapters: item.chapters.map((chapterItem) => chapterItem.id === nextEntry.chapterId ? { ...chapterItem, entries: chapterItem.entries.map((candidate) => candidate.id === nextEntry.id ? { ...nextEntry, updatedAt: Date.now() } : candidate) } : chapterItem) } : item), updatedAt: Date.now() }))
    setPendingNewEntryId(null)
    setNav((current) => ({ ...current, mode: "page" }))
    setNotice("Página salva")
  }

  function removeEntry(chapterId: string, entryId: string) {
    if (!book) return
    setWorkspace((current) => ({ ...current, books: current.books.map((item) => item.id === book.id ? { ...item, chapters: item.chapters.map((chapterItem) => chapterItem.id === chapterId ? { ...chapterItem, entries: chapterItem.entries.filter((candidate) => candidate.id !== entryId) } : chapterItem) } : item), updatedAt: Date.now() }))
  }

  function cancelEdit() {
    if (nav.entryId && pendingNewEntryId === nav.entryId) {
      removeEntry(nav.chapterId!, nav.entryId)
      setPendingNewEntryId(null)
      setNav((current) => ({ ...current, entryId: null, mode: "topic" }))
      return
    }
    setNav((current) => ({ ...current, mode: "page" }))
  }

  function deleteEntry() {
    if (!nav.entryId || !nav.chapterId) return
    if (!window.confirm("Excluir esta página? Os recursos anexados também serão removidos.")) return
    removeEntry(nav.chapterId, nav.entryId)
    setPendingNewEntryId(null)
    setNav((current) => ({ ...current, entryId: null, mode: "topic" }))
    setNotice("Página excluída")
  }

  function commitResource(next: BookResource) {
    if (!book || !entry) return
    saveEntry({ ...entry, resources: entry.resources.map((resource) => resource.id === next.id ? next : resource) })
    setQuickEditResource(null)
  }

  function removeQuickResource(resourceId: string) {
    if (!book || !entry) return
    saveEntry({ ...entry, resources: entry.resources.filter((resource) => resource.id !== resourceId) })
    setQuickEditResource(null)
  }

  async function syncToObsidian() {
    if (!window.showDirectoryPicker) { setNotice("Use Chrome ou Edge para conectar uma pasta do Obsidian."); return }
    try {
      const root = await window.showDirectoryPicker({ id: "runas-book-vault", mode: "readwrite" })
      for (const currentBook of workspace.books) for (const currentChapter of currentBook.chapters) for (const pageEntry of currentChapter.entries) {
        const folder = await directoryAt(root, ["Runas Book", currentBook.title, currentChapter.title])
        const file = await folder.getFileHandle(`${slugify(pageEntry.title)}.md`, { create: true })
        const writable = await file.createWritable()
        const resourceLines = pageEntry.resources.map((resource) => `- ${resource.entity.name}`).join("\n")
        await writable.write(`---\nrunas_book: true\nrunas_book_id: ${pageEntry.id}\nrunas_kind: ${pageEntry.kind}\n---\n\n# ${pageEntry.title}\n\n${pageEntry.summary}\n\n${pageEntry.content || "Página pronta para receber o texto completo do livro."}\n${resourceLines ? `\n## Recursos\n\n${resourceLines}\n` : ""}`)
        await writable.close()
      }
      setNotice("Wiki sincronizada no vault do Obsidian")
    } catch (error) { setNotice(error instanceof Error ? `Obsidian: ${error.message}` : "Não foi possível sincronizar o vault.") }
  }

  function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
  }

  function saveBookSettings(patch: Pick<BookRecord, "title" | "subtitle" | "author" | "accent" | "coverImageDataUrl">) {
    if (!book) return
    setWorkspace((current) => ({ ...current, books: current.books.map((item) => item.id === book.id ? { ...item, ...patch } : item), updatedAt: Date.now() }))
    setShowBookSettings(false)
    setNotice("Configurações do livro salvas")
  }

  function saveCustomPages(pages: BookCustomPage[]) {
    if (!book) return
    setWorkspace((current) => ({ ...current, books: current.books.map((item) => item.id === book.id ? { ...item, customPages: pages } : item), updatedAt: Date.now() }))
    setShowCustomPages(false)
    setNotice("Páginas customizadas salvas")
  }

  async function runExport(format: "pdf" | "docx", destination: "download" | "vault") {
    if (!book) return
    setExporting(`${destination}-${format}`)
    try {
      // Os geradores (pdfmake/docx) só são baixados quando alguém exporta.
      const blob = format === "pdf"
        ? await (await import("../lib/book-export/toPdf")).generateBookPdfBlob(book)
        : await (await import("../lib/book-export/toDocx")).generateBookDocxBlob(book)
      const filename = `${slugify(book.title)}.${format}`
      if (destination === "vault") {
        if (!window.showDirectoryPicker) { setNotice("Use Chrome ou Edge para salvar direto no vault do Obsidian."); return }
        const root = await window.showDirectoryPicker({ id: "runas-book-vault", mode: "readwrite" })
        const folder = await directoryAt(root, ["Livros"])
        const file = await folder.getFileHandle(filename, { create: true })
        const writable = await file.createWritable()
        await writable.write(blob)
        await writable.close()
        setNotice(`Livro salvo em Livros/${filename} no Obsidian`)
      } else {
        downloadBlob(filename, blob)
        setNotice("Livro exportado")
      }
      setShowExportDialog(false)
    } catch (error) {
      setNotice(error instanceof Error ? `Exportação: ${error.message}` : "Não foi possível exportar o livro.")
    } finally {
      setExporting(null)
    }
  }

  if (mode === "dm" && (authChecking || !authenticated)) return <AuthScreen checking={authChecking} token={token} password={password} error={authError} onToken={setToken} onPassword={setPassword} onSubmit={async () => {
    setAuthError("")
    try {
      const response = await fetch("/api/book-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) })
      if (!response.ok) throw new Error("Token ou senha incorretos.")
      sessionStorage.setItem(AUTH_KEY, "yes"); setAuthenticated(true); setToken(""); setPassword("")
    } catch (error) {
      if ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && token && password) { sessionStorage.setItem(AUTH_KEY, "yes"); setAuthenticated(true) }
      else setAuthError(error instanceof Error ? error.message : "Não foi possível validar o acesso.")
    }
  }} />

  if (!book) return <div className="book-empty">Nenhum livro cadastrado.</div>

  return <main className="book-shell" style={{ "--book-accent": book.accent } as React.CSSProperties}>
    <header className="book-topbar">
      <button className="icon-link sidebar-toggle" onClick={() => setSidebarOpen((current) => !current)} aria-label="Alternar índice"><Menu size={20} /></button>
      <a className="book-brand" href="/"><span className="brand-mark"><RuneMark size={16} /></span><span><strong>Runas Book</strong><small>Biblioteca de regras</small></span></a>
      <button className="book-switcher" onClick={goToBooks}><Library size={16} /><span className="book-switcher-title">{book.title}</span><ChevronRight size={15} /></button>
      <div className="top-actions">
        <a href={mode === "dm" ? "/" : "/dm"} className="ghost-link">{mode === "dm" ? "Abrir leitura" : "Área DM"}</a>
        <button className="icon-link" onClick={() => setShowExportDialog(true)} title="Exportar livro"><FileType2 size={18} /></button>
        {mode === "dm" && <button className="icon-link" onClick={() => setShowCustomPages(true)} title="Páginas customizadas do livro"><FileStack size={18} /></button>}
        {mode === "dm" && <button className="icon-link" onClick={() => setShowBookSettings(true)} title="Configurações do livro"><Settings size={18} /></button>}
        {mode === "dm" && <button className="icon-link" onClick={syncToObsidian} title="Sincronizar com Obsidian"><Upload size={18} /></button>}
        <a className="icon-link" href="https://runas-tools.pages.dev" title="Runas Tools"><ExternalLink size={18} /></a>
      </div>
    </header>
    <div className={`book-layout ${sidebarOpen ? "sidebar-open" : ""}`}>
      <BookSidebar book={book} isDm={isDm} expanded={expanded} activeChapterId={nav.chapterId} activeEntryId={nav.entryId} onToggleChapter={toggleChapter} onSelectChapter={openTopic} onSelectEntry={openEntry} onAddChapter={openChapterEditor} onAddEntry={openNewPage} onDeleteChapter={removeChapter} />
      {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Fechar índice" />}
      <section className="book-content">
        {nav.mode === "edit" && entry && <PageEditor entry={entry} pageTitles={pageTitles} onSave={saveEntry} onCancel={cancelEdit} onDelete={deleteEntry} />}

        {nav.mode === "page" && entry && chapter && <PageView book={book} chapter={chapter} entry={entry} isDm={isDm} onOpenBooks={goToBooks} onOpenTopic={openTopic} onOpenEntry={openEntry} onEdit={openEdit} onEditResource={setQuickEditResource} />}

        {(nav.mode === "topic" || (!entry && nav.mode !== "edit")) && chapter && <>
          <div className="content-intro"><div><p className="eyebrow"><Sparkles size={14} /> {book.subtitle}</p><h1>{chapter.title}</h1><p>{chapter.summary || "Uma estrutura viva para consultar o sistema e transformar regras em registros prontos para a ficha."}</p></div></div>
          <label className="book-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nesta seção…" /><kbd>{visibleEntries.length}</kbd></label>
          <div className="entry-grid">{visibleEntries.map((candidate) => <button key={candidate.id} className="entry-card" onClick={() => openEntry(chapter.id, candidate.id)}><span className={`entry-type type-${candidate.kind}`}>{candidate.kind === "character" ? "Ficha" : "Regra"}</span><h2>{candidate.title}</h2><p>{candidate.summary || "Registro pronto para receber detalhes e referências."}</p><footer><span>{candidate.sourcePage ? `p. ${candidate.sourcePage}` : "Runas Book"}</span><ChevronRight size={16} /></footer></button>)}</div>
          {visibleEntries.length === 0 && <div className="empty-state"><FileText size={30} /><strong>Nenhuma página nesta busca</strong><p>Limpe o termo{isDm ? " ou crie uma nova página no tópico." : "."}</p></div>}
          {isDm && <button className="sidebar-add" onClick={() => openNewPage(chapter.id)}><BookPlus size={16} /> Nova página neste tópico</button>}
        </>}

        {!chapter && <div className="empty-state"><FileText size={30} /><strong>Nenhum tópico neste livro</strong><p>{isDm ? "Crie o primeiro tópico na barra lateral." : "Volte em breve."}</p></div>}
      </section>
    </div>
    <footer className="book-footer"><span>Runas Book · conteúdo estruturado e exportável</span><span>{book.chapters.length} tópicos · {book.chapters.reduce((count, item) => count + item.entries.length, 0)} páginas</span></footer>

    {showBooks && <div className="modal-backdrop" onMouseDown={() => setShowBooks(false)}><section className="modal-card book-picker" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">Biblioteca</p><h2>Escolha um livro</h2></div><button className="icon-link" onClick={() => setShowBooks(false)}><X size={18} /></button></header><div className="book-list">{workspace.books.map((item) => <div key={item.id} className="book-list-row">
      <button className="book-list-select" onClick={() => selectBook(item.id)}><span className="book-dot" style={{ background: item.accent }} /><span><strong>{item.title}</strong><small>{item.subtitle} · {item.chapters.length} tópicos</small></span><ChevronRight size={17} /></button>
      {mode === "dm" && <button className="book-delete" onClick={() => removeBook(item.id)} title="Excluir livro" aria-label="Excluir livro"><Trash2 size={15} /></button>}
    </div>)}</div>{mode === "dm" && <div className="new-book-row"><input value={newBookTitle} onChange={(event) => setNewBookTitle(event.target.value)} placeholder="Nome de um novo livro" /><button className="primary-action" onClick={addBook}><Plus size={16} /> Cadastrar</button></div>}</section></div>}

    {showChapterEditor && <div className="modal-backdrop" onMouseDown={() => setShowChapterEditor(false)}><section className="modal-card" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">Estrutura</p><h2>Novo tópico</h2></div><button className="icon-link" onClick={() => setShowChapterEditor(false)}><X size={18} /></button></header><input className="form-input" value={newChapterTitle} onChange={(event) => setNewChapterTitle(event.target.value)} placeholder="Ex.: Regras de combate" autoFocus /><button className="primary-action full" onClick={addChapter}><Plus size={16} /> Criar tópico</button></section></div>}

    {showNewPage && <div className="modal-backdrop" onMouseDown={() => setShowNewPage(false)}><section className="modal-card" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">{chapter?.title}</p><h2>Nova página</h2></div><button className="icon-link" onClick={() => setShowNewPage(false)}><X size={18} /></button></header><label>Título<input className="form-input" value={newPageTitle} onChange={(event) => setNewPageTitle(event.target.value)} autoFocus /></label><label>Tipo<select className="form-input" value={newPageKind} onChange={(event) => setNewPageKind(event.target.value as BookEntryKind)}><option value="rule">Página de regra</option><option value="character">Ficha completa</option></select></label><button className="primary-action full" onClick={createPage} disabled={!newPageTitle.trim()}><Check size={16} /> Criar e editar</button></section></div>}

    {quickEditResource && <ResourceEditorDialog resource={quickEditResource} onSave={commitResource} onDelete={() => removeQuickResource(quickEditResource.id)} onClose={() => setQuickEditResource(null)} />}

    {showBookSettings && <BookSettingsDialog book={book} onSave={saveBookSettings} onClose={() => setShowBookSettings(false)} />}

    {showCustomPages && <CustomPagesEditor pages={book.customPages} onSave={saveCustomPages} onClose={() => setShowCustomPages(false)} />}

    {showExportDialog && <div className="modal-backdrop" onMouseDown={() => setShowExportDialog(false)}>
      <section className="modal-card export-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">Exportação</p><h2>Exportar “{book.title}”</h2><p>Capa, sumário{book.customPages.length > 0 ? ", páginas customizadas" : ""} e capítulos, com fichas, habilidades, magias e itens formatados.</p></div><button className="icon-link" onClick={() => setShowExportDialog(false)}><X size={18} /></button></header>
        <div className="export-section">
          <span className="export-section-label">Baixar</span>
          <div className="export-actions-row">
            <button className="outline-action" disabled={exporting !== null} onClick={() => void runExport("pdf", "download")}>{exporting === "download-pdf" ? <Loader2 size={15} className="spin" /> : <Download size={15} />} PDF</button>
            {isDm && <button className="outline-action" disabled={exporting !== null} onClick={() => void runExport("docx", "download")}>{exporting === "download-docx" ? <Loader2 size={15} className="spin" /> : <Download size={15} />} DOCX</button>}
          </div>
        </div>
        {isDm && <div className="export-section">
          <span className="export-section-label">Salvar no Obsidian (pasta Livros/)</span>
          <div className="export-actions-row">
            <button className="outline-action" disabled={exporting !== null} onClick={() => void runExport("pdf", "vault")}>{exporting === "vault-pdf" ? <Loader2 size={15} className="spin" /> : <FolderInput size={15} />} PDF</button>
            <button className="outline-action" disabled={exporting !== null} onClick={() => void runExport("docx", "vault")}>{exporting === "vault-docx" ? <Loader2 size={15} className="spin" /> : <FolderInput size={15} />} DOCX</button>
          </div>
        </div>}
        <p className="export-hint">Versão beta: tabelas sem mesclagem de células, e o Word pode pedir para atualizar o sumário (F9) ao abrir o DOCX.</p>
      </section>
    </div>}

    {notice && <button className="toast" onClick={() => setNotice("")}><Check size={15} /> {notice}</button>}
  </main>
}

// Chaves distintas: o cartão de login é um elemento novo, não a caixa de carregamento redimensionada (evita deslocamento de layout).
function AuthScreen({ checking, token, password, error, onToken, onPassword, onSubmit }: { checking: boolean; token: string; password: string; error: string; onToken: (value: string) => void; onPassword: (value: string) => void; onSubmit: () => void }) {
  if (checking) return <main className="auth-shell"><RuneMark className="auth-watermark" /><div key="auth-loading" className="auth-loading" style={{ position: "relative" }}><span className="brand-mark"><RuneMark size={16} /></span><p>Reabrindo o arquivo DM…</p></div></main>
  return <main className="auth-shell"><RuneMark className="auth-watermark" /><div key="auth-card" className="auth-card"><span className="auth-icon"><LockKeyhole size={24} /></span><p className="eyebrow"><ShieldCheck size={14} /> Runas Book DM</p><h1>Desbloquear biblioteca</h1><p className="auth-copy">Tópicos, páginas e recursos exportáveis ficam protegidos pela mesma camada privada do Runas DM.</p><form onSubmit={(event) => { event.preventDefault(); onSubmit() }}><label><span>Token privado</span><div><KeyRound size={16} /><input type="password" value={token} onChange={(event) => onToken(event.target.value)} autoComplete="off" placeholder="Cole o token do Runas DM" /></div></label><label><span>Senha</span><div><LockKeyhole size={16} /><input type="password" value={password} onChange={(event) => onPassword(event.target.value)} autoComplete="current-password" placeholder="Digite sua senha" /></div></label>{error && <p className="auth-error">{error}</p>}<button className="primary-action full" disabled={!token || !password}><WandSparkles size={16} /> Entrar e editar</button></form><small>Cloudflare Access continua sendo a primeira barreira em produção.</small></div></main>
}

async function directoryAt(root: FileSystemDirectoryHandle, parts: string[]) {
  let current = root
  for (const part of parts) current = await current.getDirectoryHandle(part, { create: true })
  return current
}

declare global {
  interface Window { showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> }
}
