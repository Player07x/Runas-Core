"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { characterElements } from "@runas/core/data/elements"
import { Download, FileJson, ImageDown, Images, RotateCcw, Save, Search, Trash2, Upload } from "lucide-react"
import { ImageCropper } from "@/components/runic-cards/image-cropper"
import { RunicCardPreview } from "@/components/runic-cards/runic-card-preview"
import { Button } from "@/components/ui/button"
import { DeferredRichTextEditor } from "@/components/ui/deferred-rich-text-editor"
import { SelectField } from "@/components/ui/select-field"
import { TextField } from "@/components/ui/text-field"
import { cardFilename, createEmptyRunicCard, createRunicCardFile, createRunicCardGalleryFile, normalizeRunicCard, normalizeRunicCardCollection, RUNIC_CARD_GALLERY_LIMIT, runicCardKinds, runicCardRarities, type RunicCard, type RunicCardKind } from "@/lib/runicCards"
import { loadRunicCardGallery, saveRunicCardGallery } from "@/lib/runicCardDatabase"
import { saveExportedBlob, saveExportedJson } from "@/lib/fileExport"
import { cn } from "@/lib/utils"

const DRAFT_KEY = "runas-tools:runic-card-draft:v1"
const GALLERY_PAGE_SIZE = 20

export function RunicCardEditor({ view = "create", onOpenCreate }: { view?: "create" | "gallery" | "rules"; onOpenCreate?: () => void }) {
  const [card, setCard] = useState<RunicCard>(() => createEmptyRunicCard())
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState("")
  const [exporting, setExporting] = useState(false)
  const [gallery, setGallery] = useState<RunicCard[]>([])
  const [galleryReady, setGalleryReady] = useState(false)
  const [galleryPage, setGalleryPage] = useState(1)
  const [gallerySearch, setGallerySearch] = useState("")
  const [kindFilter, setKindFilter] = useState<RunicCardKind | "all">("all")
  const [elementFilter, setElementFilter] = useState("all")
  const [rarityFilter, setRarityFilter] = useState<RunicCard["rarity"] | "all">("all")
  const [editionFilter, setEditionFilter] = useState("all")
  const previewRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const galleryImportRef = useRef<HTMLInputElement>(null)
  const editionOptions = useMemo(() => [...new Set(gallery.map((entry) => entry.edition.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [gallery])
  const filteredGallery = useMemo(() => {
    const query = gallerySearch.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
    return gallery.filter((entry) => {
      const name = entry.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
      return (!query || name.includes(query))
        && (kindFilter === "all" || entry.kind === kindFilter)
        && (elementFilter === "all" || entry.elementId === elementFilter)
        && (rarityFilter === "all" || entry.rarity === rarityFilter)
        && (editionFilter === "all" || entry.edition === editionFilter)
    })
  }, [editionFilter, elementFilter, gallery, gallerySearch, kindFilter, rarityFilter])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DRAFT_KEY)
      if (stored) setCard(normalizeRunicCard(JSON.parse(stored)))
    } catch {
      window.localStorage.removeItem(DRAFT_KEY)
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    let active = true
    void loadRunicCardGallery().then((cards) => { if (active) { setGallery(cards); setGalleryReady(true) } })
      .catch(() => { if (active) setGalleryReady(true) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!galleryReady) return
    const timeout = window.setTimeout(() => void saveRunicCardGallery(gallery), 350)
    return () => window.clearTimeout(timeout)
  }, [gallery, galleryReady])

  useEffect(() => { setGalleryPage(1) }, [editionFilter, elementFilter, gallerySearch, kindFilter, rarityFilter])

  useEffect(() => {
    setGalleryPage((page) => Math.min(page, Math.max(1, Math.ceil(filteredGallery.length / GALLERY_PAGE_SIZE))))
  }, [filteredGallery.length])

  useEffect(() => {
    if (!ready) return
    const timeout = window.setTimeout(() => { try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(card)) } catch { /* A galeria IndexedDB preserva cartas grandes. */ } }, 250)
    return () => window.clearTimeout(timeout)
  }, [card, ready])

  function update<K extends keyof RunicCard>(key: K, value: RunicCard[K]) {
    setCard((current) => ({ ...current, [key]: value }))
    setMessage("")
  }

  function changeKind(kind: RunicCardKind) {
    const defaults = createEmptyRunicCard(kind)
    setCard((current) => ({
      ...defaults,
      id: current.id,
      name: current.name,
      elementId: current.elementId,
      rarity: current.rarity,
      rulesHtml: current.rulesHtml,
      flavorText: current.flavorText,
      artDataUrl: current.artDataUrl,
      edition: current.edition,
    }))
    setMessage("")
  }

  async function importCard(file: File | undefined) {
    if (!file) return
    try {
      const imported = normalizeRunicCardCollection(JSON.parse(await file.text()))[0]
      setCard(imported)
      setMessage("Carta importada. O rascunho local foi atualizado.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível importar a carta.")
    } finally {
      if (importInputRef.current) importInputRef.current.value = ""
    }
  }

  function saveToGallery() {
    setGallery((current) => {
      const existing = current.findIndex((entry) => entry.id === card.id)
      if (existing >= 0) return current.map((entry, index) => index === existing ? card : entry)
      if (current.length >= RUNIC_CARD_GALLERY_LIMIT) return current
      return [card, ...current]
    })
    setMessage(gallery.some((entry) => entry.id === card.id) ? "Carta atualizada na galeria." : gallery.length >= RUNIC_CARD_GALLERY_LIMIT ? "A galeria já possui 200 cartas." : "Carta salva na galeria.")
  }

  async function importGallery(file: File | undefined) {
    if (!file) return
    try {
      const imported = normalizeRunicCardCollection(JSON.parse(await file.text()))
      let accepted = 0
      setGallery((current) => {
        const byId = new Map(current.map((entry) => [entry.id, entry]))
        for (const entry of imported) {
          if (!byId.has(entry.id) && byId.size >= RUNIC_CARD_GALLERY_LIMIT) break
          byId.set(entry.id, entry)
          accepted += 1
        }
        return [...byId.values()].slice(0, RUNIC_CARD_GALLERY_LIMIT)
      })
      setMessage(`${accepted} carta(s) importada(s) para a galeria.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível importar a galeria.")
    } finally {
      if (galleryImportRef.current) galleryImportRef.current.value = ""
    }
  }

  async function exportGallery() {
    await saveExportedJson(createRunicCardGalleryFile(gallery), "galeria-cartas-runicas.json")
    setMessage(`${gallery.length} carta(s) exportada(s).`)
  }

  async function exportJson() {
    await saveExportedJson(createRunicCardFile(card), cardFilename(card, "json"))
    setMessage("JSON exportado com os dados e a arte da carta.")
  }

  async function exportPng() {
    const node = previewRef.current
    if (!node || exporting) return
    setExporting(true)
    setMessage("")
    try {
      // A prévia só aplica a fonte Norse quando a página fica ociosa; a exportação não espera por isso.
      const shell = node.closest<HTMLElement>(".runic-card-shell")
      if (shell && shell.dataset.fonts !== "ready") shell.dataset.fonts = "ready"
      await Promise.all([document.fonts.load("1em Norse"), document.fonts.load('700 1em "Norse Bold"')]).catch(() => undefined)
      const { toBlob } = await import("html-to-image")
      const blob = await toBlob(node, {
        cacheBust: true,
        pixelRatio: 1,
        canvasWidth: 1512,
        canvasHeight: 2112,
        backgroundColor: "transparent",
      })
      if (!blob) throw new Error("O navegador não conseguiu montar a imagem.")
      await saveExportedBlob(blob, cardFilename(card, "png"), "Carta Rúnica em PNG")
      setMessage("PNG exportado em alta resolução.")
    } catch (error) {
      setMessage(error instanceof Error ? `Falha ao exportar PNG: ${error.message}` : "Falha ao exportar PNG.")
    } finally {
      setExporting(false)
    }
  }

  function resetCard() {
    if (!window.confirm("Limpar o rascunho atual e começar uma nova carta?")) return
    const next = createEmptyRunicCard(card.kind)
    setCard(next)
    window.localStorage.removeItem(DRAFT_KEY)
    setMessage("Novo rascunho criado.")
  }

  const isCombatCard = card.kind === "adventurer" || card.kind === "troop"
  const hasCost = card.kind === "troop" || card.kind === "spell"
  const galleryPageCount = Math.max(1, Math.ceil(filteredGallery.length / GALLERY_PAGE_SIZE))
  const visibleGallery = filteredGallery.slice((galleryPage - 1) * GALLERY_PAGE_SIZE, galleryPage * GALLERY_PAGE_SIZE)

  return (
    <div className="space-y-6">
      {view === "create" && <>
      <section className="rounded-3xl border border-border bg-card p-4 shadow-[0_12px_36px_rgba(30,36,55,0.07)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Criador de cartas</h2>
            <p className="mt-1 text-sm text-muted-foreground">O rascunho é salvo automaticamente neste navegador.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={importInputRef} className="sr-only" type="file" accept="application/json,.json" aria-label="Selecionar arquivo JSON de carta" onChange={(event) => void importCard(event.target.files?.[0])} />
            <Button type="button" variant="outline" onClick={() => importInputRef.current?.click()}><Upload />Importar JSON</Button>
            <Button type="button" variant="ghost" onClick={resetCard}><RotateCcw />Nova carta</Button>
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Categoria da carta</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {runicCardKinds.map((kind) => (
              <button
                key={kind.value}
                type="button"
                aria-pressed={card.kind === kind.value}
                onClick={() => changeKind(kind.value)}
                className={cn(
                  "h-11 rounded-xl border px-3 text-sm font-bold transition",
                  card.kind === kind.value ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {kind.label}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.82fr)]">
        <section className="min-w-0 space-y-5 rounded-3xl border border-border bg-card p-4 shadow-[0_12px_36px_rgba(30,36,55,0.07)] sm:p-6" aria-label="Dados da carta">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nome" value={card.name} onChange={(value) => update("name", value)} placeholder="Nome da carta" />
            <TextField label={card.kind === "spell" ? "Tipo de magia" : "Tipo"} value={card.type} onChange={(value) => update("type", value)} placeholder={card.kind === "spell" ? "Feitiço, Ritual, Magia Rápida…" : "Humano, Runa, Arma…"} />
            <TextField label="Coleção / edição" value={card.edition} onChange={(value) => update("edition", value)} placeholder="Ex.: Primeira Edição" />
            <SelectField label="Elemento" value={card.elementId} onChange={(value) => update("elementId", value)} options={characterElements.map((element) => ({ value: element.id, label: element.kind === "Fusão" ? `${element.name} · Fusão` : element.name }))} />
            {card.kind !== "adventurer" && <SelectField label="Raridade" value={card.rarity} onChange={(value) => update("rarity", value as RunicCard["rarity"])} options={runicCardRarities.map((rarity) => ({ value: rarity.value, label: `${rarity.label} · até ${rarity.copies} cópia${rarity.copies === 1 ? "" : "s"}` }))} />}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {hasCost && <NumberField label="Custo" value={card.cost} min={0} max={10} onChange={(value) => update("cost", value)} />}
            {card.kind === "adventurer" && <NumberField label="Ganho de Energia" value={card.energyGain} min={0} max={10} onChange={(value) => update("energyGain", value)} prefix="+" />}
            {isCombatCard && <NumberField label="Vida" value={card.life} min={0} max={999} onChange={(value) => update("life", value)} />}
            {isCombatCard && <NumberField label="Aura" value={card.aura} min={0} max={999} onChange={(value) => update("aura", value)} />}
            {isCombatCard && <NumberField label="Dano" value={card.damage} min={0} max={999} onChange={(value) => update("damage", value)} />}
            {isCombatCard && <SelectField label="Tipo de dano" value={card.damageKind} onChange={(value) => update("damageKind", value as RunicCard["damageKind"])} options={[{ value: "physical", label: "FIS · Físico" }, { value: "magical", label: "MAG · Mágico" }, { value: "hybrid", label: "FIS/MAG · Físico ou Mágico" }]} />}
          </div>

          <ImageCropper currentImage={card.artDataUrl} onApply={(dataUrl) => update("artDataUrl", dataUrl)} />

          <DeferredRichTextEditor label="Texto de regras" value={card.rulesHtml} onChange={(value) => update("rulesHtml", value)} maxLength={3000} />
          <TextField label="Flavor text" type="textarea" value={card.flavorText} onChange={(value) => update("flavorText", value)} placeholder="Uma frase narrativa curta…" />
        </section>

        <aside className="min-w-0 xl:sticky xl:top-24" aria-label="Prévia e exportação">
          <div className="rounded-3xl border border-border bg-card p-3 shadow-[0_12px_36px_rgba(30,36,55,0.09)] sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight">Prévia</h2>
                <p className="text-xs text-muted-foreground">Proporção física 63 × 88 mm.</p>
              </div>
              <Download className="size-5 text-muted-foreground" />
            </div>
            <RunicCardPreview ref={previewRef} card={card} />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={saveToGallery}><Save />Salvar na galeria</Button>
              <Button type="button" variant="outline" onClick={() => void exportJson()}><FileJson />Exportar JSON</Button>
              <Button type="button" onClick={() => void exportPng()} disabled={exporting}><ImageDown />{exporting ? "Gerando…" : "Exportar PNG"}</Button>
              <a href="/runic-card-back.webp" download="verso-carta-runica.webp" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted"><Download className="size-4" />Baixar verso para TTS</a>
            </div>
            {message && <p role="status" className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">{message}</p>}
          </div>
        </aside>
      </div>
      </>}

      {view === "gallery" && <section className="rounded-3xl border border-border bg-card p-4 shadow-[0_12px_36px_rgba(30,36,55,0.07)] sm:p-6" aria-labelledby="runic-gallery-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="runic-gallery-title" className="flex items-center gap-2 text-lg font-bold"><Images className="size-5" />Galeria de cartas</h2><p className="mt-1 text-sm text-muted-foreground">{gallery.length} de {RUNIC_CARD_GALLERY_LIMIT} cartas salvas neste navegador.</p></div>
          <div className="flex flex-wrap gap-2">
            <input ref={galleryImportRef} className="sr-only" type="file" accept="application/json,.json" aria-label="Selecionar arquivo JSON da galeria de cartas" onChange={(event) => void importGallery(event.target.files?.[0])} />
            <Button type="button" variant="outline" onClick={() => galleryImportRef.current?.click()}><Upload />Importar cartas</Button>
            <Button type="button" variant="outline" disabled={!gallery.length} onClick={() => void exportGallery()}><Download />Exportar todas</Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="relative block sm:col-span-2 lg:col-span-1"><span className="sr-only">Buscar carta pelo nome</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input type="search" value={gallerySearch} onChange={(event) => setGallerySearch(event.target.value)} placeholder="Buscar pelo nome" className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/25" /></label>
          <label><span className="sr-only">Filtrar por categoria</span><select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as RunicCardKind | "all")} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="all">Todas as categorias</option>{runicCardKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
          <label><span className="sr-only">Filtrar por elemento</span><select value={elementFilter} onChange={(event) => setElementFilter(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="all">Todos os elementos</option>{characterElements.map((element) => <option key={element.id} value={element.id}>{element.name}</option>)}</select></label>
          <label><span className="sr-only">Filtrar por raridade</span><select value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value as RunicCard["rarity"] | "all")} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="all">Todas as raridades</option>{runicCardRarities.map((rarity) => <option key={rarity.value} value={rarity.value}>{rarity.label}</option>)}</select></label>
          <label><span className="sr-only">Filtrar por edição</span><select value={editionFilter} onChange={(event) => setEditionFilter(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="all">Todas as edições</option>{editionOptions.map((edition) => <option key={edition} value={edition}>{edition}</option>)}</select></label>
        </div>
        <p className="mt-3 text-xs font-medium text-muted-foreground">{filteredGallery.length} {filteredGallery.length === 1 ? "carta encontrada" : "cartas encontradas"}</p>
        {filteredGallery.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibleGallery.map((entry) => <article key={entry.id} className="overflow-hidden rounded-2xl border border-border bg-background">
            <button type="button" className="block w-full text-left" onClick={() => { setCard(entry); setMessage(`Editando “${entry.name}”.`); onOpenCreate?.(); window.scrollTo({ top: 0, behavior: "smooth" }) }}>
              <div className="aspect-[63/32] bg-muted bg-cover bg-center" style={entry.artDataUrl ? { backgroundImage: `linear-gradient(0deg, rgb(0 0 0 / .48), transparent), url(${entry.artDataUrl})` } : undefined} />
              <div className="p-3"><strong className="block truncate text-sm">{entry.name || "Carta sem nome"}</strong><span className="text-xs text-muted-foreground">{entry.edition || "Sem edição"}</span></div>
            </button>
            <button type="button" className="mx-3 mb-3 inline-flex items-center gap-1 text-xs font-semibold text-destructive" onClick={() => setGallery((current) => current.filter((candidate) => candidate.id !== entry.id))}><Trash2 className="size-3.5" />Excluir</button>
          </article>)}
        </div> : <p className="mt-5 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{gallery.length ? "Nenhuma carta corresponde aos filtros escolhidos." : "Salve a primeira carta para iniciar sua coleção."}</p>}
        {galleryPageCount > 1 && <nav aria-label="Páginas da galeria de cartas" className="mt-5 flex flex-wrap justify-center gap-2">{Array.from({ length: galleryPageCount }, (_, index) => index + 1).map((page) => <Button key={page} type="button" size="sm" variant={page === galleryPage ? "default" : "outline"} aria-current={page === galleryPage ? "page" : undefined} onClick={() => setGalleryPage(page)}>{page}</Button>)}</nav>}
        {message && <p role="status" className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">{message}</p>}
      </section>}
    </div>
  )
}

function NumberField({ label, value, min, max, prefix, onChange }: { label: string; value: number; min: number; max: number; prefix?: string; onChange: (value: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="flex h-11 items-center rounded-xl border border-input bg-background/70 px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
        {prefix && <span className="mr-1 text-sm font-bold text-muted-foreground">{prefix}</span>}
        <input className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none" type="number" value={value} min={min} max={max} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || 0)))} />
      </span>
    </label>
  )
}
