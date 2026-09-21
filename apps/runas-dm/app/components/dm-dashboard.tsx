"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Archive, ArrowUpDown, Bolt, BookMarked, BookOpenText, ChevronDown, Copy, Database, Download, Edit3, FileArchive, Filter, LibraryBig, ListOrdered, Plus, RefreshCw,
  Search, Send, Shield, Sparkles, Swords, Trash2, Upload, X,
} from "lucide-react"
import type { VttLogEntry } from "@runas/vtt-bridge"
import { attributeGroups } from "@runas/core/data/attributes"
import { systemSkills } from "@runas/core/data/skills"
import { characterElements, getCharacterElement } from "@runas/core/data/elements"
import { calculateCharacterStatSnapshot } from "@runas/core/lib/characterStatCalculations"
import { calculateDamageSequence, convertDamageBonusesToDice, rollDice } from "@runas/core/lib/damageCalculator"
import { parseDamageExpressions } from "@runas/core/lib/damageParser"
import { simulateDamageApplications } from "@runas/core/lib/damageApplication"
import { calculateMasteryImprovementPoints, calculateSpentMasteryImprovementPoints, clampMasteryImprovementQuantity, masteryImprovementOptions } from "@runas/core/lib/masteryImprovements"
import { calculateEquippedArmorDefense, inventoryTypeOptions, inventoryUsageOptions } from "@runas/core/lib/inventoryCalculations"
import { calculateItemSizeModifier } from "@runas/core/lib/characterCalculations"
import { formatSigned } from "@runas/core/lib/bondCalculations"
import { calculateItemDamageBonus, composeItemDamageExpression } from "@runas/core/lib/itemDamage"
import { listCharacterTestSources } from "@runas/core/lib/characterTestSources"
import type { ImportedAbility } from "@runas/core/lib/abilityTransfer"
import type { ImportedSpell } from "@runas/core/lib/spellTransfer"
import { synchronizeCharacterDerivedValues } from "@runas/core/lib/characterSynchronization"
import { applyQuickModifier } from "@runas/core/lib/quickModifier"
import { applyDeterminationToRoll, applyDeterminationUsesToRoll, calculateAttributeTest, calculateSkillLevel, compareSkillRolls, findExactSystemSkill, normalizeSkillName, rollSkillTest } from "@runas/core/lib/skillCalculations"
import type { AttributeKey, Character, CharacterSkill, CharacterSpell, SecondaryAttributeKey } from "@runas/core/types/character"
import type { SkillRoll, SkillRollOutcome, SpecialDieId } from "@runas/core/types/skillTest"
import {
  characterImage, cloneCharacter, createEmptyCharacter, createInitialState, essenceYield,
  normalizeRunasDmState, type BestiaryEntry, type EncounterActor, type InitiativeEntry, type MasteryTable, type RunasDmState,
} from "../lib/model"
import { parseRunasImport } from "../lib/import"
import { parseGalleryZip } from "@runas/core/lib/galleryImport"
import { loadLocalState, saveLocalState } from "../lib/storage"
import { AdvancedSheetEditor } from "./advanced-sheet-editor"
import { ItemAttachments, abilityAttachment, spellAttachment } from "./item-attachments"
import { AttributeBands } from "./attribute-bands"
import { PwaInstallCard } from "./pwa-install-card"
import { ThemeToggle } from "./theme-toggle"
import { TopbarMenu } from "./topbar-menu"
import { clampSimpleSheetWidth, plainTextSummary } from "../lib/simple-sheet"
import { BatchExportDialog } from "./batch-export-dialog"
import { TokenEditorDialog } from "./token-editor-dialog"
import { exportCharacterJson } from "../lib/export"
import { createRunasDmBackup, synchronizeRunasDmState } from "../lib/backup-sync"
import { useEscapeToClose } from "../lib/use-escape-to-close"
import { BackupTokenDialog } from "./backup-token-dialog"
import { RichTextEditor } from "./rich-text-editor"
import { exportEncounterMarkdown, importEncounterMarkdown } from "../lib/encounter-notes"
import { resourceLoss, useVttMesa } from "../lib/vtt-mesa"

type WorkspaceView = "gallery" | "encounter"
type SaveStatus = "loading" | "saving" | "saved" | "error"
type CloudAction = "backup" | "synchronize"

const secondaryAttributes: Array<{ key: SecondaryAttributeKey; label: string }> = attributeGroups.flatMap((group) =>
  group.attributes.map((attribute) => ({ key: attribute.key as SecondaryAttributeKey, label: attribute.name })),
)

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function listFromText(value: string): string[] {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
}

function outcomeLabel(outcome: SkillRollOutcome): string {
  if (outcome === "critical-success") return "Sucesso crítico"
  if (outcome === "critical-failure") return "Fracasso crítico"
  return outcome === "success" ? "Sucesso" : "Fracasso"
}

export function DmDashboard() {
  const [state, setState] = useState<RunasDmState>(() => createInitialState())
  const [ready, setReady] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading")
  const [view, setView] = useState<WorkspaceView>("gallery")
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [elementFilter, setElementFilter] = useState("all")
  const [gallerySort, setGallerySort] = useState<"name" | "affinity" | "essences">("name")
  const [editing, setEditing] = useState<BestiaryEntry | null>(null)
  const [editingActor, setEditingActor] = useState<EncounterActor | null>(null)
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState("")
  const [batchExportOpen, setBatchExportOpen] = useState(false)
  const [pendingCloudAction, setPendingCloudAction] = useState<CloudAction | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  // Dentro do RunasVTT, a Mesa opera sobre os tokens da cena aberta nele.
  const vttMesa = useVttMesa(setSyncMessage)
  const encounterActors = vttMesa?.actors ?? state.encounter

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("view") === "encounter") setView("encounter")
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    let active = true
    void loadLocalState().then((stored) => {
      if (!active) return
      if (stored) setState(normalizeRunasDmState(stored))
      setReady(true)
      setSaveStatus("saved")
    }).catch(() => {
      setReady(true)
      setSaveStatus("error")
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!ready) return
    const next = { ...state, updatedAt: Date.now() }
    const timeout = setTimeout(() => {
      setSaveStatus("saving")
      void saveLocalState(next).then(() => setSaveStatus("saved")).catch(() => setSaveStatus("error"))
    }, 250)
    return () => clearTimeout(timeout)
  }, [ready, state])

  const galleryCategoryOptions = useMemo(() => [...new Set(state.entries.map(({ character }) => character.info.race.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR")), [state.entries])
  const galleryElementOptions = useMemo(() => [...new Set(state.entries.map(({ character }) => character.stats.elementId).filter((value) => value && value !== "none"))].map((id) => ({ id, name: getCharacterElement(id)?.name ?? id })).sort((left, right) => left.name.localeCompare(right.name, "pt-BR")), [state.entries])

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR")
    const numberFromText = (value: string) => {
      const match = value.replace(/\./g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/)
      return match ? Number(match[0]) : 0
    }
    return state.entries
      .filter(({ character }) => !term || [character.name, character.info.race, character.info.affinity, getCharacterElement(character.stats.elementId)?.name].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)))
      .filter(({ character }) => categoryFilter === "all" || character.info.race === categoryFilter)
      .filter(({ character }) => elementFilter === "all" || character.stats.elementId === elementFilter)
      .sort((left, right) => {
        if (gallerySort === "affinity") return numberFromText(right.character.info.affinity) - numberFromText(left.character.info.affinity) || left.character.name.localeCompare(right.character.name, "pt-BR")
        if (gallerySort === "essences") return numberFromText(right.character.info.essences) - numberFromText(left.character.info.essences) || left.character.name.localeCompare(right.character.name, "pt-BR")
        return left.character.name.localeCompare(right.character.name, "pt-BR")
      })
  }, [categoryFilter, elementFilter, gallerySort, search, state.entries])

  const selectedActor = encounterActors.find((actor) => actor.id === selectedActorId) ?? encounterActors[0] ?? null

  function updateState(updater: (current: RunasDmState) => RunasDmState) {
    setState((current) => ({ ...updater(current), updatedAt: Date.now() }))
  }

  function createSheet() {
    setEditing({ id: id("sheet"), character: createEmptyCharacter(), masteryTableId: "default", updatedAt: Date.now() })
  }

  function saveSheet(entry: BestiaryEntry) {
    updateState((current) => ({
      ...current,
      entries: current.entries.some((candidate) => candidate.id === entry.id)
        ? current.entries.map((candidate) => candidate.id === entry.id ? { ...entry, updatedAt: Date.now() } : candidate)
        : [{ ...entry, updatedAt: Date.now() }, ...current.entries],
    }))
    setEditing(null)
  }

  function saveActorSheet(entry: BestiaryEntry) {
    updateActor(entry.id, entry.character, entry.masteryTableId)
    setEditingActor(null)
  }

  function deleteSheet(entryId: string) {
    updateState((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== entryId),
      encounter: current.encounter.filter((actor) => actor.sourceId !== entryId),
    }))
  }

  async function sendToVtt(entries: Pick<BestiaryEntry, "character" | "masteryTableId">[]) {
    if (!vttMesa) return
    const sent = await vttMesa.sendEntries(entries)
    if (sent) setSyncMessage(`${sent} ${sent === 1 ? "ficha enviada" : "fichas enviadas"} ao RunasVTT`)
  }

  function addToEncounter(entry: BestiaryEntry) {
    if (vttMesa) { void sendToVtt([entry]); setView("encounter"); return }
    const copies = state.encounter.filter((actor) => actor.sourceId === entry.id).length
    const actor: EncounterActor = {
      id: id("actor"), sourceId: entry.id, copyNumber: copies + 1, character: cloneCharacter(entry.character), masteryTableId: entry.masteryTableId,
    }
    updateState((current) => ({ ...current, encounter: [...current.encounter, actor] }))
    setSelectedActorId(actor.id)
    setView("encounter")
  }

  function duplicateActor(actor: EncounterActor) {
    if (vttMesa) { void sendToVtt([actor]); return }
    const copyNumber = Math.max(0, ...state.encounter.filter((item) => item.sourceId === actor.sourceId).map((item) => item.copyNumber)) + 1
    const copy = { ...actor, id: id("actor"), copyNumber, character: cloneCharacter(actor.character) }
    updateState((current) => ({ ...current, encounter: [...current.encounter, copy] }))
    setSelectedActorId(copy.id)
  }

  function restoreActor(actor: EncounterActor) {
    const source = state.entries.find((entry) => entry.id === actor.sourceId)
    if (!source) return
    const skipWarning = window.event instanceof MouseEvent && window.event.shiftKey
    if (!skipWarning && !window.confirm("Você tem certeza que quer restaurar as estatísticas da ficha?")) return
    updateActor(actor.id, cloneCharacter(source.character), source.masteryTableId)
  }

  function updateActor(actorId: string, character: Character, masteryTableId?: string) {
    if (vttMesa) {
      const actor = vttMesa.actors.find((candidate) => candidate.id === actorId)
      void vttMesa.updateActor(actorId, character, masteryTableId ?? actor?.masteryTableId ?? "default")
      return
    }
    updateState((current) => ({
      ...current,
      encounter: current.encounter.map((actor) => actor.id === actorId ? { ...actor, character, masteryTableId: masteryTableId ?? actor.masteryTableId } : actor),
    }))
  }

  function removeActor(actorId: string) {
    updateState((current) => ({ ...current, encounter: current.encounter.filter((actor) => actor.id !== actorId) }))
    if (selectedActorId === actorId) setSelectedActorId(null)
  }

  function exportWorkspace() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `runas-dm-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importWorkspace(files: File[]) {
    if (files.length === 0) return
    const characters: Character[] = []
    let workspace: RunasDmState | null = null
    let ignored = 0

    for (const file of files) {
      try {
        if (file.name.toLocaleLowerCase().endsWith(".zip")) {
          const batch = await parseGalleryZip(file)
          characters.push(...batch.characters.map((entry) => entry.character))
          ignored += batch.ignoredFiles
          continue
        }
        const parsed = parseRunasImport(JSON.parse(await file.text()) as unknown)
        if (parsed.kind === "workspace") workspace = normalizeRunasDmState(parsed.state)
        else characters.push(parsed.character)
      } catch {
        ignored += 1
      }
    }

    if (!workspace && characters.length === 0) {
      setSyncMessage("Nenhuma ficha Runas válida foi encontrada nos arquivos selecionados.")
      return
    }

    const now = Date.now()
    setState((current) => {
      const base = workspace ? synchronizeRunasDmState(current, workspace, now) : current
      return {
        ...base,
        entries: [
          ...characters.map((character) => ({ id: id("sheet"), character, masteryTableId: "default", updatedAt: now })),
          ...base.entries,
        ],
        updatedAt: now,
      }
    })
    const imported = characters.length
    const parts = [workspace ? "backup do Runas DM sincronizado" : "", imported ? `${imported} ${imported === 1 ? "ficha importada" : "fichas importadas"} do Runas Tools` : "", ignored ? `${ignored} arquivo(s) ignorado(s)` : ""].filter(Boolean)
    setSyncMessage(parts.join(" · "))
  }

  function requestCloudAction(action: CloudAction) {
    const token = sessionStorage.getItem("runas-dm.backup-token") ?? ""
    if (!token) {
      setPendingCloudAction(action)
      return
    }
    if (action === "backup") void backupToCloud(token)
    else void synchronizeFromCloud(token)
  }

  function duplicateSheet(entry: BestiaryEntry) {
    const copy: BestiaryEntry = {
      ...entry,
      id: id("sheet"),
      character: cloneCharacter(entry.character),
      updatedAt: Date.now(),
    }
    copy.character.name = `${entry.character.name || "Ficha"} (Cópia)`
    updateState((current) => ({ ...current, entries: [copy, ...current.entries] }))
  }

  function submitBackupToken(token: string) {
    const action = pendingCloudAction
    sessionStorage.setItem("runas-dm.backup-token", token)
    setPendingCloudAction(null)
    if (action === "backup") void backupToCloud(token)
    if (action === "synchronize") void synchronizeFromCloud(token)
  }

  async function backupToCloud(token: string) {
    setSyncMessage("Enviando backup…")
    try {
      const currentResponse = await fetch("/api/backup", { headers: { authorization: `Bearer ${token}` } })
      if (currentResponse.status === 401) sessionStorage.removeItem("runas-dm.backup-token")
      if (!currentResponse.ok) throw new Error()
      const currentBackup = await currentResponse.json() as { state: RunasDmState | null }
      const completeBackup = createRunasDmBackup(state, currentBackup.state)
      const response = await fetch("/api/backup", { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(completeBackup) })
      if (response.status === 401) sessionStorage.removeItem("runas-dm.backup-token")
      if (!response.ok) throw new Error()
      setSyncMessage("Backup remoto atualizado")
    } catch {
      setSyncMessage("Backup remoto indisponível neste ambiente")
    }
  }

  async function synchronizeFromCloud(token: string) {
    setSyncMessage("Consultando backup remoto…")
    try {
      const response = await fetch("/api/backup", { headers: { authorization: `Bearer ${token}` } })
      if (response.status === 401) sessionStorage.removeItem("runas-dm.backup-token")
      if (!response.ok) throw new Error()
      const payload = await response.json() as { state: RunasDmState | null; updatedAt: number | null }
      if (!payload.state) { setSyncMessage("Ainda não existe backup remoto"); return }
      const date = payload.updatedAt ? new Date(payload.updatedAt).toLocaleString("pt-BR") : "data desconhecida"
      if (!window.confirm(`Sincronizar as fichas deste dispositivo com o backup de ${date}? Fichas com o mesmo nome, raça e elemento serão atualizadas pelo backup; as demais serão preservadas.`)) { setSyncMessage("Sincronização cancelada"); return }
      setState((current) => synchronizeRunasDmState(current, payload.state as RunasDmState))
      setSyncMessage(`Fichas sincronizadas com o backup de ${date}`)
    } catch {
      setSyncMessage("Não foi possível sincronizar o backup remoto")
    }
  }

  return (
    <main className="dm-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("gallery")} aria-label="Abrir galeria">
          <span className="brand-rune">R</span>
          <span className="brand-copy"><strong>Runas DM</strong><small>Mesa rápida</small></span>
        </button>
        <nav className="view-switch" aria-label="Áreas do Runas DM">
          <button className={view === "gallery" ? "active" : ""} onClick={() => setView("gallery")}><Archive size={17} /> Bestiário</button>
          <button className={view === "encounter" ? "active" : ""} onClick={() => setView("encounter")}><Swords size={17} /> Mesa <span>{encounterActors.length}</span></button>
          <a href="/campaigns"><BookMarked size={17} /> Campanhas</a>
          <a href="/wiki"><LibraryBig size={17} /> Wiki</a>
        </nav>
        <div className="top-actions">
          <TopbarMenu status={{ tone: saveStatus === "saving" || saveStatus === "loading" ? "busy" : saveStatus === "error" ? "bad" : "good", label: saveStatus === "saving" ? "Salvando" : saveStatus === "error" ? "Falha local" : saveStatus === "loading" ? "Abrindo bestiário" : "Salvo localmente" }}>
            {(close) => <>
              <ThemeToggle variant="menu" />
              <button className="topbar-menu-item" onClick={() => { close(); exportWorkspace() }}><Download size={18} /><span>Exportar backup</span></button>
              <button className="topbar-menu-item" onClick={() => { close(); importRef.current?.click() }}><Upload size={18} /><span>Importar fichas JSON ou ZIP</span></button>
              <a className="topbar-menu-item" href="https://runas-book.pages.dev/dm" onClick={close}><BookOpenText size={18} /><span>Runas Book DM</span></a>
            </>}
          </TopbarMenu>
          <input ref={importRef} hidden multiple type="file" accept="application/json,.json,application/zip,.zip" onChange={(event) => { void importWorkspace(Array.from(event.target.files ?? [])); event.currentTarget.value = "" }} />
        </div>
      </header>

      {view === "gallery" ? (
        <section className="workspace gallery-workspace">
          {!vttMesa && <PwaInstallCard />}
          <div className="workspace-heading">
            <div><p className="eyebrow">Galeria de fichas</p><h1>Seu bestiário, pronto para agir.</h1><p>{state.entries.length} {state.entries.length === 1 ? "ficha salva" : "fichas salvas"}.</p></div>
            <div className="heading-actions"><button className="secondary-button" disabled={state.entries.length === 0} onClick={() => setBatchExportOpen(true)}>{vttMesa ? <><Send size={16} /> Enviar fichas ao VTT</> : <><FileArchive size={16} /> Exportar fichas</>}</button><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={16} /> Importar fichas</button><button className="secondary-button" onClick={() => requestCloudAction("synchronize")}><RefreshCw size={16} /> Sincronizar</button><button className="secondary-button" onClick={() => requestCloudAction("backup")}><Database size={17} /> Backup</button><button className="primary-button" onClick={createSheet}><Plus size={18} /> Nova ficha</button></div>
          </div>
          {syncMessage && <div className="inline-notice">{syncMessage}</div>}
          <div className="gallery-toolbar">
            <div className="gallery-controls">
              <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, raça, afinidade ou elemento…" /></label>
              <label className="gallery-select"><Filter size={15} /><span>Categoria</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Todas</option>{galleryCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
              <label className="gallery-select"><Filter size={15} /><span>Elemento</span><select value={elementFilter} onChange={(event) => setElementFilter(event.target.value)}><option value="all">Todos</option>{galleryElementOptions.map((element) => <option key={element.id} value={element.id}>{element.name}</option>)}</select></label>
              <label className="gallery-select"><ArrowUpDown size={15} /><span>Organizar</span><select value={gallerySort} onChange={(event) => setGallerySort(event.target.value as typeof gallerySort)}><option value="name">Nome (A–Z)</option><option value="affinity">Afinidade (maior)</option><option value="essences">Essências (maior)</option></select></label>
            </div>
            <span>{filteredEntries.length} {filteredEntries.length === 1 ? "exibida" : "exibidas"}</span>
          </div>
          <div className="sheet-grid">
            {filteredEntries.map((entry) => <SheetCard key={entry.id} entry={entry} onOpen={() => setEditing({ ...entry, character: cloneCharacter(entry.character) })} onAdd={() => addToEncounter(entry)} onDuplicate={() => duplicateSheet(entry)} onDelete={() => deleteSheet(entry.id)} />)}
            <button className="new-sheet-card" onClick={createSheet}><span><Plus size={24} /></span><strong>Criar nova ficha</strong><small>Comece pelo formato simplificado</small></button>
          </div>
        </section>
      ) : (
        <EncounterWorkspace vtt={vttMesa ? { selectedTokenId: vttMesa.selectedTokenId, log: vttMesa.log, notice: syncMessage } : null} actors={encounterActors} selectedId={selectedActor?.id ?? null} entries={state.entries} notesHtml={state.workspaceNotesHtml} initiative={state.initiative} onNotesChange={(workspaceNotesHtml) => updateState((current) => ({ ...current, workspaceNotesHtml }))} onInitiativeChange={(initiative) => updateState((current) => ({ ...current, initiative }))} onSelect={setSelectedActorId} onAdd={addToEncounter} onEdit={(actor) => setEditingActor({ ...actor, character: cloneCharacter(actor.character) })} onRestore={restoreActor} onDuplicate={duplicateActor} onRemove={removeActor} onUpdate={updateActor} />
      )}

      {editing && <SheetEditor entry={editing} tables={state.masteryTables} onSendToVtt={vttMesa ? (character, masteryTableId) => void sendToVtt([{ character, masteryTableId }]) : undefined} onClose={() => setEditing(null)} onSave={saveSheet} onTablesChange={(masteryTables) => updateState((current) => ({ ...current, masteryTables }))} />}
      {editingActor && <SheetEditor entry={{ id: editingActor.id, character: editingActor.character, masteryTableId: editingActor.masteryTableId, updatedAt: Date.now() }} tables={state.masteryTables} onClose={() => setEditingActor(null)} onSave={saveActorSheet} onTablesChange={(masteryTables) => updateState((current) => ({ ...current, masteryTables }))} />}
      {batchExportOpen && <BatchExportDialog entries={state.entries} onSendToVtt={vttMesa ? (entries) => void sendToVtt(entries) : undefined} onClose={() => setBatchExportOpen(false)} />}
      {pendingCloudAction && <BackupTokenDialog onClose={() => setPendingCloudAction(null)} onSubmit={submitBackupToken} />}
      {!ready && <div className="loading-screen"><span className="brand-rune">R</span><p>Abrindo a mesa…</p></div>}
    </main>
  )
}

function SheetCard({ entry, onOpen, onAdd, onDuplicate, onDelete }: { entry: BestiaryEntry; onOpen: () => void; onAdd: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const { character } = entry
  const element = getCharacterElement(character.stats.elementId)
  return (
    <article className={`sheet-card compact ${characterImage(character) ? "has-portrait" : ""}`} style={{ "--element-color": element?.color ?? "#79dce0" } as React.CSSProperties}>
      <div className={`card-rune ${characterImage(character) ? "has-portrait" : ""}`} aria-hidden="true">{characterImage(character) ? <img src={characterImage(character)} alt="" /> : <span>{character.name.slice(0, 1) || "R"}</span>}</div>
      <div className="card-title"><button className="card-title-button" onClick={onOpen} title="Abrir ficha simplificada"><p>{character.info.race || "Sem raça"} · {character.info.affinity || "Sem afinidade"} · EF {character.info.efficiency || "0"}%</p><h2>{character.name || "Sem nome"}</h2></button><div className="card-quick-actions"><button className="icon-button compact-add" onClick={onAdd} title="Levar à mesa" aria-label="Levar à mesa"><Plus size={16} /></button><button className="icon-button compact-add" onClick={onDuplicate} title="Duplicar ficha" aria-label="Duplicar ficha"><Copy size={15} /></button><button className="icon-button subtle danger-icon" onClick={onDelete} title="Excluir ficha" aria-label="Excluir ficha"><Trash2 size={15} /></button></div></div>
      <button className="bestiary-overview" onClick={onOpen} title="Abrir ficha simplificada">
        <span className="compact-resources"><span><b>{character.stats.pv}</b> PV</span><span><b>{character.stats.pa}</b> PA{character.stats.paExtra > 0 && <i>+{character.stats.paExtra}</i>}</span><span><b>{character.stats.pe}</b> PE{character.stats.peTemporary > 0 && <i>+{character.stats.peTemporary}</i>}</span></span>
        <span className="compact-attributes"><span><b>FÍS {character.attributes.physical}</b><i>for {character.attributes.strength} · des {character.attributes.dexterity} · vit {character.attributes.vitality}</i></span><span><b>MEN {character.attributes.mental}</b><i>int {character.attributes.intelligence} · con {character.attributes.knowledge} · soc {character.attributes.social}</i></span><span><b>MÍS {character.attributes.mystic}</b><i>fé {character.attributes.faith} · pod {character.attributes.power} · sor {character.attributes.luck}</i></span></span>
      </button>
    </article>
  )
}

/** Mesa dentro do RunasVTT: os atores são tokens, e testes e danos vão para o Registro dele. */
interface VttEncounter {
  selectedTokenId: string | null
  log: (entry: VttLogEntry) => void
  notice: string
}

function EncounterWorkspace({ vtt, actors, selectedId, entries, notesHtml, initiative, onNotesChange, onInitiativeChange, onSelect, onAdd, onEdit, onRestore, onDuplicate, onRemove, onUpdate }: { vtt: VttEncounter | null; actors: EncounterActor[]; selectedId: string | null; entries: BestiaryEntry[]; notesHtml: string; initiative: InitiativeEntry[]; onNotesChange: (value: string) => void; onInitiativeChange: (value: InitiativeEntry[]) => void; onSelect: (id: string) => void; onAdd: (entry: BestiaryEntry) => void; onEdit: (actor: EncounterActor) => void; onRestore: (actor: EncounterActor) => void; onDuplicate: (actor: EncounterActor) => void; onRemove: (id: string) => void; onUpdate: (id: string, character: Character) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const selected = actors.find((actor) => actor.id === selectedId) ?? actors[0] ?? null
  return (
    <section className="workspace encounter-workspace">
      <div className="encounter-main">
        <div className="workspace-heading compact"><div><p className="eyebrow">Mesa de encontro{vtt ? " · RunasVTT" : ""}</p><h1>Controle sem trocar de tela.</h1><p>{vtt ? "Os atores são os tokens com ficha da cena aberta no RunasVTT. Dano confirmado atualiza o token." : "Cada criatura é uma cópia independente da ficha do bestiário."}</p></div><button className="primary-button" onClick={() => setPickerOpen((value) => !value)}><Plus size={18} /> {vtt ? "Enviar inimigo à cena" : "Anexar inimigo"}</button></div>{vtt?.notice && <div className="inline-notice">{vtt.notice}</div>}
        {pickerOpen && <div className="actor-picker">{entries.map((entry) => <button key={entry.id} onClick={() => { onAdd(entry); setPickerOpen(false) }}><span className={`mini-rune ${characterImage(entry.character) ? "has-portrait" : ""}`}>{characterImage(entry.character) ? <img src={characterImage(entry.character)} alt="" /> : entry.character.name.slice(0, 1)}</span><span><strong>{entry.character.name}</strong><small>{entry.character.info.race}</small></span><Plus size={17} /></button>)}</div>}
        {actors.length === 0 ? <div className="empty-encounter"><Swords size={42} /><h2>A mesa está vazia</h2><p>{vtt ? "Envie fichas do bestiário para a cena aberta no RunasVTT; cada uma vira um token." : "Anexe uma ficha do bestiário para criar uma cópia de combate."}</p><button className="primary-button" onClick={() => setPickerOpen(true)}><Plus size={17} /> Anexar primeiro inimigo</button></div> : <div className="actor-grid">{actors.map((actor) => <ActorCard key={actor.id} actor={actor} selected={actor.id === selected?.id} inVtt={vtt !== null} onSelect={() => onSelect(actor.id)} onEdit={() => onEdit(actor)} onRestore={() => onRestore(actor)} onDuplicate={() => onDuplicate(actor)} onRemove={() => onRemove(actor.id)} />)}</div>}
      </div>
      <aside className="action-dock"><EncounterDock vtt={vtt} selected={selected} actors={actors} notesHtml={notesHtml} initiative={initiative} onNotesChange={onNotesChange} onInitiativeChange={onInitiativeChange} onUpdate={onUpdate} /></aside>
    </section>
  )
}

function ActorCard({ actor, selected, inVtt, onSelect, onEdit, onRestore, onDuplicate, onRemove }: { actor: EncounterActor; selected: boolean; inVtt: boolean; onSelect: () => void; onEdit: () => void; onRestore: () => void; onDuplicate: () => void; onRemove: () => void }) {
  const element = getCharacterElement(actor.character.stats.elementId)
  const snapshot = calculateCharacterStatSnapshot(actor.character.attributes, actor.character.info, actor.character.stats, actor.character.skills, actor.character.abilities)
  return <article className={`actor-card ${selected ? "selected" : ""}`} onClick={onSelect} style={{ "--element-color": element?.color ?? "#79dce0" } as React.CSSProperties}><div className="actor-head"><span className={`mini-rune ${characterImage(actor.character) ? "has-portrait" : ""}`}>{characterImage(actor.character) ? <img src={characterImage(actor.character)} alt="" /> : actor.copyNumber}</span><div><small>{element?.name ?? "Sem elemento"}</small><h2>{actor.character.name} #{actor.copyNumber}</h2></div><div><button className="icon-button subtle" onClick={(event) => { event.stopPropagation(); onEdit() }} title="Editar ficha desta cópia"><Edit3 size={15} /></button>{!inVtt && <button className="icon-button subtle" onClick={(event) => { event.stopPropagation(); onRestore() }} title="Restaurar ficha do bestiário"><RefreshCw size={15} /></button>}<button className="icon-button subtle" onClick={(event) => { event.stopPropagation(); onDuplicate() }} title="Duplicar"><Copy size={16} /></button>{!inVtt && <button className="icon-button subtle" onClick={(event) => { event.stopPropagation(); onRemove() }} title="Remover"><X size={16} /></button>}</div></div><div className="actor-resources"><ResourceBar label="PV" value={actor.character.stats.pv} maximum={snapshot.pvMax} color="red" /><ResourceBar label="PA" value={actor.character.stats.pa} maximum={snapshot.paMax} extra={actor.character.stats.paExtra} color="cyan" /><ResourceBar label="PE" value={actor.character.stats.pe} maximum={snapshot.peMax} extra={actor.character.stats.peTemporary} color="violet" /></div><p>{actor.character.stats.effects || "Nenhum efeito ativo"}</p></article>
}

function ResourceBar({ label, value, maximum, extra = 0, color }: { label: string; value: number; maximum: number; extra?: number; color: string }) {
  const percentage = maximum > 0 ? Math.min(100, Math.max(0, value / maximum * 100)) : value > 0 ? 100 : 0
  return <div className={`resource-bar ${color}`}><span>{label}</span><strong>{value}<small>/{maximum}</small>{extra > 0 ? ` +${extra}` : ""}</strong><i style={{ width: `${percentage}%` }} /></div>
}

function EncounterDock({ vtt, selected, actors, notesHtml, initiative, onNotesChange, onInitiativeChange, onUpdate }: { vtt: VttEncounter | null; selected: EncounterActor | null; actors: EncounterActor[]; notesHtml: string; initiative: InitiativeEntry[]; onNotesChange: (value: string) => void; onInitiativeChange: (value: InitiativeEntry[]) => void; onUpdate: (id: string, character: Character) => void }) {
  const [screen, setScreen] = useState<"actions" | "notes" | "initiative">("actions")
  return <div className="dock-suite"><div className="dock-screen-tabs" role="tablist" aria-label="Painéis da mesa"><button className={screen === "actions" ? "active" : ""} onClick={() => setScreen("actions")}><Bolt size={15} /> Ações Integradas</button><button className={screen === "notes" ? "active" : ""} onClick={() => setScreen("notes")}><BookOpenText size={15} /> Notas</button><button className={screen === "initiative" ? "active" : ""} onClick={() => setScreen("initiative")}><ListOrdered size={15} /> Iniciativa</button></div>{screen === "actions" ? selected ? <><QuickActions key={selected.id} actor={selected} targets={[...actors.filter((candidate) => candidate.id !== selected.id), selected]} preferredTargetId={vtt?.selectedTokenId ?? null} onLog={vtt?.log} onUpdate={(character) => onUpdate(selected.id, character)} onUpdateTarget={onUpdate} /><MassiveDamagePanel attacker={selected} targets={actors} onLog={vtt?.log} onUpdateTarget={onUpdate} /></> : <div className="dock-empty"><Bolt size={28} /><p>Selecione uma criatura para abrir testes e dano.</p></div> : screen === "notes" ? <EncounterNotes notesHtml={notesHtml} initiative={initiative} actors={actors} onNotesChange={onNotesChange} onInitiativeChange={onInitiativeChange} /> : <InitiativePanel actors={actors} initiative={initiative} onChange={onInitiativeChange} />}</div>
}

function downloadMarkdown(content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `runas-dm-notas-${new Date().toISOString().slice(0, 10)}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}

function EncounterNotes({ notesHtml, initiative, actors, onNotesChange, onInitiativeChange }: { notesHtml: string; initiative: InitiativeEntry[]; actors: EncounterActor[]; onNotesChange: (value: string) => void; onInitiativeChange: (value: InitiativeEntry[]) => void }) {
  const importRef = useRef<HTMLInputElement>(null)
  async function importMarkdown(file?: File) {
    if (!file) return
    const imported = importEncounterMarkdown(await file.text(), actors)
    onNotesChange(imported.notesHtml)
    onInitiativeChange(imported.initiative)
  }
  return <div className="encounter-notes"><RichTextEditor label="Texto da sessão" value={notesHtml} onChange={onNotesChange} className="encounter-notes-editor" /><div className="notes-file-actions"><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={15} /> Importar MD</button><button className="primary-button" onClick={() => downloadMarkdown(exportEncounterMarkdown(notesHtml, initiative))}><Download size={15} /> Exportar MD</button><input ref={importRef} hidden type="file" accept="text/markdown,.md" onChange={(event) => { void importMarkdown(event.target.files?.[0]); event.currentTarget.value = "" }} /></div><p className="modifier-hint">A exportação inclui a iniciativa atual, a ordem e os IDs das criaturas anexadas à mesa.</p></div>
}

function InitiativePanel({ actors, initiative, onChange }: { actors: EncounterActor[]; initiative: InitiativeEntry[]; onChange: (value: InitiativeEntry[]) => void }) {
  const [actorId, setActorId] = useState(actors[0]?.id ?? "")
  const [manualName, setManualName] = useState("")
  const ordered = [...initiative].sort((left, right) => (right.value ?? Number.NEGATIVE_INFINITY) - (left.value ?? Number.NEGATIVE_INFINITY) || left.name.localeCompare(right.name, "pt-BR"))
  function addActor() {
    const actor = actors.find((candidate) => candidate.id === actorId)
    if (!actor || initiative.some((entry) => entry.actorId === actor.id)) return
    onChange([...initiative, { id: id("initiative"), actorId: actor.id, name: actor.character.name, value: null }])
  }
  function addManual() {
    const name = manualName.trim()
    if (!name) return
    onChange([...initiative, { id: id("initiative"), actorId: null, name, value: null }])
    setManualName("")
  }
  function rollReflex(entry: InitiativeEntry) {
    const actor = entry.actorId ? actors.find((candidate) => candidate.id === entry.actorId) : undefined
    if (!actor) return
    const reflex = actor.character.skills.find((skill) => ["reflexo", "reflexos"].includes(normalizeSkillName(skill.name)))
    const roll = rollSkillTest({ config: { attributeKey: reflex?.attributeKey || "dexterity", skillName: "Reflexo", skillModifier: reflex ? calculateSkillLevel(reflex.points) + reflex.modifier : -4, masterModifier: 0, otherModifiers: 0, specialDieId: "none" }, attributes: actor.character.attributes })
    if (roll) onChange(initiative.map((item) => item.id === entry.id ? { ...item, value: roll.margin } : item))
  }
  return <div className="initiative-panel"><div className="dock-title"><div><p className="eyebrow">Ordem automática</p><h2>Iniciativa</h2></div><ListOrdered size={20} /></div><div className="initiative-add"><label><span>Ficha na mesa</span><select value={actorId} onChange={(event) => setActorId(event.target.value)}>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.character.name} #{actor.copyNumber}</option>)}</select></label><button onClick={addActor}><Plus size={14} /> Anexar</button><label><span>Inserção manual</span><input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Nome" onKeyDown={(event) => { if (event.key === "Enter") addManual() }} /></label><button onClick={addManual}><Plus size={14} /> Inserir</button></div><div className="initiative-list">{ordered.map((entry, index) => { const actor = entry.actorId ? actors.find((candidate) => candidate.id === entry.actorId) : null; return <article key={entry.id}><b>{index + 1}</b><div><strong>{actor ? `${actor.character.name} #${actor.copyNumber}` : entry.name}</strong><small>{actor ? "Ficha anexada" : "Inserção manual"}</small></div>{actor && <button className="roll-reflex" onClick={() => rollReflex(entry)}><Shield size={13} /> Reflexos</button>}<DeferredNumberInput ariaLabel={`Iniciativa de ${entry.name}`} value={entry.value} defaultValue={0} onChange={(value) => onChange(initiative.map((item) => item.id === entry.id ? { ...item, value } : item))} /><button className="linked-remove" onClick={() => onChange(initiative.filter((item) => item.id !== entry.id))}><X size={14} /></button></article> })}{ordered.length === 0 && <p className="simple-empty-state">Nenhuma iniciativa cadastrada.</p>}</div></div>
}

interface MassiveTargetSettings {
  selected: boolean
  modifier: string
  modifierOpen: boolean
  advancedOpen: boolean
  rdf: number
  rdm: number
  mtEnabled: boolean
  mtValue: number
}

interface MassiveDamagePreview {
  actor: EncounterActor
  next: Character
  detail: string
  apply: boolean
}

function MassiveDamagePanel({ attacker, targets, onUpdateTarget, onLog }: { attacker: EncounterActor; targets: EncounterActor[]; onUpdateTarget: (id: string, character: Character) => void; onLog?: (entry: VttLogEntry) => void }) {
  const [enabled, setEnabled] = useState(false)
  const [expression, setExpression] = useState("2D cortante")
  const [defaultModifier, setDefaultModifier] = useState("")
  const [defaultAdvancedOpen, setDefaultAdvancedOpen] = useState(false)
  const [defaultRdf, setDefaultRdf] = useState(0)
  const [defaultRdm, setDefaultRdm] = useState(0)
  const [defaultMtEnabled, setDefaultMtEnabled] = useState(true)
  const [defaultMtValue, setDefaultMtValue] = useState(0)
  const [settings, setSettings] = useState<Record<string, MassiveTargetSettings>>({})
  const [previews, setPreviews] = useState<MassiveDamagePreview[]>([])
  const [error, setError] = useState("")
  const [choosing, setChoosing] = useState(false)
  useEscapeToClose(() => setChoosing(false))

  function toggle(next: boolean) {
    setEnabled(next)
    setPreviews([])
    if (!next) return
    setSettings(Object.fromEntries(targets.map((target) => [target.id, { selected: true, modifier: defaultModifier, modifierOpen: false, advancedOpen: defaultAdvancedOpen, rdf: defaultRdf || target.character.stats.armorRdf + target.character.stats.naturalRdf, rdm: defaultRdm || target.character.stats.armorRdm + target.character.stats.naturalRdm, mtEnabled: defaultMtEnabled, mtValue: defaultMtValue || target.character.stats.mt }])))
  }

  function updateSetting(actorId: string, patch: Partial<MassiveTargetSettings>) {
    setSettings((current) => ({ ...current, [actorId]: { ...current[actorId], ...patch } }))
    setPreviews([])
  }

  function simulate() {
    const parsed = parseDamageExpressions(expression)
    if (!parsed.length || parsed.some((part) => !part.damageTypeId)) { setError("Informe danos completos, como 2D cortante, 3D congelante adicional."); return }
    const rolledParts = parsed.map((part) => {
      const attributeValue = part.attributeKey ? attacker.character.attributes[part.attributeKey] : 0
      const conversion = convertDamageBonusesToDice(part.numDice, [attributeValue, part.bonus])
      return { config: { numDice: part.numDice, damageTypeId: part.damageTypeId!, attributeKey: (part.attributeKey ?? "none") as AttributeKey | "none", otherModifier: part.bonus, mtEnabled: true, mtValue: attacker.character.stats.mt, otherMultiplier: "1", rdf: 0, rdm: 0 }, diceRolls: part.numDice > 0 ? rollDice(conversion.numDice) : [], attributeValue }
    })
    const baseResults = calculateDamageSequence(rolledParts, 0, 0).results
    const nextPreviews: MassiveDamagePreview[] = []
    for (const target of targets) {
      const config = settings[target.id]
      if (!config?.selected) continue
      const stats = target.character.stats
      const snapshot = calculateCharacterStatSnapshot(target.character.attributes, target.character.info, stats, target.character.skills, target.character.abilities)
      const element = getCharacterElement(stats.elementId)
      const resistances = [...new Set([...(element?.resistances ?? []), ...stats.resistances])]
      const weaknesses = [...new Set([...(element?.weaknesses ?? []), ...stats.weaknesses])]
      const damages = baseResults.map((result) => ({ amount: applyQuickModifier(result.total, config.modifier), damageTypeId: result.damageTypeId }))
      const simulation = simulateDamageApplications({ damages, mtEnabled: config.mtEnabled, mtValue: config.mtValue, rdf: config.rdf, rdm: config.rdm, attributeBonuses: { vitality: target.character.attributes.vitality, power: target.character.attributes.power, faith: target.character.attributes.faith, luck: target.character.attributes.luck }, layers: [
        { resource: "paExtra", current: stats.paExtra, resistances: [], weaknesses: [], multiplier: "1x", breakMultiplier: "1x" },
        { resource: "pa", current: stats.pa, resistances, weaknesses, multiplier: "1x", breakMultiplier: "1/2" },
        { resource: "pv", current: stats.pv, maximum: snapshot.pvMax, resistances: [], weaknesses: [], multiplier: "1x" },
      ] })
      if (!simulation.value) { setError(simulation.error ?? `Falha ao simular ${target.character.name}.`); return }
      const next = cloneCharacter(target.character)
      for (const change of simulation.value.changes) {
        const value = next.stats[change.resource] + change.amount
        next.stats[change.resource] = change.resource === "pv" ? value : Math.max(0, value)
      }
      nextPreviews.push({ actor: target, next, detail: [simulation.value.resultText, ...simulation.value.notices].filter(Boolean).join(" · "), apply: true })
    }
    setError("")
    setPreviews(nextPreviews)
  }

  function applySelected(items: MassiveDamagePreview[]) {
    for (const preview of items.filter((item) => item.apply)) {
      onUpdateTarget(preview.actor.id, preview.next)
      onLog?.({ kind: "damage", title: `${preview.actor.character.name}: dano massivo de ${attacker.character.name}`, detail: preview.detail, tokenId: preview.actor.id, floatingText: `-${resourceLoss(preview.actor.character, preview.next)}` })
    }
    setPreviews([])
    setChoosing(false)
  }

  return <section className={`massive-damage ${enabled ? "enabled" : ""}`}><label className="massive-toggle"><input type="checkbox" checked={enabled} onChange={(event) => toggle(event.target.checked)} /><span>Massivo?</span></label>{!enabled ? <div className="massive-defaults"><p>Marque para simular o mesmo ataque em todas as fichas da mesa.</p><ModifierInput value={defaultModifier} onChange={setDefaultModifier} /><button className="secondary-button" onClick={() => setDefaultAdvancedOpen((value) => !value)}>Avançado <ChevronDown size={14} /></button>{defaultAdvancedOpen && <div className="massive-advanced-default"><NumberField label="RDF padrão" value={defaultRdf} min={0} onChange={setDefaultRdf} /><NumberField label="RDM padrão" value={defaultRdm} min={0} onChange={setDefaultRdm} /><label className="check-row"><input type="checkbox" checked={defaultMtEnabled} onChange={(event) => setDefaultMtEnabled(event.target.checked)} /> Aplicar MT do alvo</label><NumberField label="MT padrão" value={defaultMtValue} onChange={setDefaultMtValue} /></div>}</div> : <><label className="massive-expression"><span>Dano massivo</span><input value={expression} onChange={(event) => { setExpression(event.target.value); setPreviews([]) }} /></label><div className="massive-targets">{targets.map((target) => { const config = settings[target.id]; if (!config) return null; return <article key={target.id}><label className="massive-target-name"><input type="checkbox" checked={config.selected} onChange={(event) => updateSetting(target.id, { selected: event.target.checked })} /><span>{target.character.name} #{target.copyNumber}</span></label><ConfigurationButtons modifierOpen={config.modifierOpen} advancedOpen={config.advancedOpen} onModifier={() => updateSetting(target.id, { modifierOpen: !config.modifierOpen })} onAdvanced={() => updateSetting(target.id, { advancedOpen: !config.advancedOpen })} />{config.modifierOpen && <ModifierInput value={config.modifier} onChange={(modifier) => updateSetting(target.id, { modifier })} />}{config.advancedOpen && <div className="massive-target-advanced"><NumberField label="RDF" value={config.rdf} min={0} onChange={(rdf) => updateSetting(target.id, { rdf })} /><NumberField label="RDM" value={config.rdm} min={0} onChange={(rdm) => updateSetting(target.id, { rdm })} /><label className="check-row"><input type="checkbox" checked={config.mtEnabled} onChange={(event) => updateSetting(target.id, { mtEnabled: event.target.checked })} /> Aplicar MT</label><NumberField label="MT" value={config.mtValue} onChange={(mtValue) => updateSetting(target.id, { mtValue })} /></div>}</article> })}</div><button className="execute-button damage" onClick={simulate}>Simular dano em todas</button>{error && <p className="massive-error">{error}</p>}{previews.length > 0 && <div className="massive-results">{previews.map((preview) => <article key={preview.actor.id}><strong>{preview.actor.character.name} #{preview.actor.copyNumber}</strong><span>{preview.detail}</span></article>)}<div><button className="execute-button confirm" onClick={() => applySelected(previews.map((preview) => ({ ...preview, apply: true })))}>Aplicar em Todas</button><button className="secondary-button" onClick={() => setChoosing(true)}>Escolher Aplicação</button></div></div>}</>}{choosing && <div className="massive-popup-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setChoosing(false) }}><div className="massive-popup" role="dialog" aria-modal="true" aria-labelledby="massive-popup-title"><header><div><p className="eyebrow">Aplicação seletiva</p><h3 id="massive-popup-title">Escolher fichas</h3></div><button className="icon-button" onClick={() => setChoosing(false)}><X size={17} /></button></header><div>{previews.map((preview) => { const snapshot = calculateCharacterStatSnapshot(preview.actor.character.attributes, preview.actor.character.info, preview.actor.character.stats, preview.actor.character.skills, preview.actor.character.abilities); return <label key={preview.actor.id}><input type="checkbox" checked={preview.apply} onChange={(event) => setPreviews((current) => current.map((item) => item.actor.id === preview.actor.id ? { ...item, apply: event.target.checked } : item))} /><span><strong>{preview.actor.character.name} #{preview.actor.copyNumber}</strong><small>PV {preview.actor.character.stats.pv}/{snapshot.pvMax} · PA {preview.actor.character.stats.pa}/{snapshot.paMax} +{preview.actor.character.stats.paExtra} extra · PE {preview.actor.character.stats.pe}/{snapshot.peMax} +{preview.actor.character.stats.peTemporary} temporário</small></span></label> })}</div><footer><button className="secondary-button" onClick={() => setChoosing(false)}>Cancelar</button><button className="primary-button" onClick={() => applySelected(previews)}>Aplicar selecionadas</button></footer></div></div>}</section>
}

/**
 * `preferredTargetId`: dentro do RunasVTT, o token selecionado no mapa vira
 * o alvo do dano. `onLog`: testes e danos vão para o Registro do VTT.
 */
function QuickActions({ actor, targets, preferredTargetId = null, onLog, onUpdate, onUpdateTarget }: { actor: EncounterActor; targets: EncounterActor[]; preferredTargetId?: string | null; onLog?: (entry: VttLogEntry) => void; onUpdate: (character: Character) => void; onUpdateTarget: (id: string, character: Character) => void }) {
  const calculatorRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<"test" | "damage">("damage")
  const [modifierOpen, setModifierOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [modifier, setModifier] = useState("")
  const [testAttribute, setTestAttribute] = useState<SecondaryAttributeKey>("dexterity")
  const [skillName, setSkillName] = useState("Reflexo")
  const [skillModifier, setSkillModifier] = useState(0)
  const [specialDie, setSpecialDie] = useState<SpecialDieId>("none")
  const [damageExpression, setDamageExpression] = useState("2D cortante")
  const [targetId, setTargetId] = useState(() => targets[0]?.id ?? "")
  const [simulationEditing, setSimulationEditing] = useState(false)
  const [mtEnabled, setMtEnabled] = useState(false)
  const initialTarget = targets[0]?.character
  const [targetRdf, setTargetRdf] = useState(() => initialTarget ? initialTarget.stats.armorRdf + initialTarget.stats.naturalRdf : 0)
  const [targetRdm, setTargetRdm] = useState(() => initialTarget ? initialTarget.stats.armorRdm + initialTarget.stats.naturalRdm : 0)
  const [targetMtEnabled, setTargetMtEnabled] = useState(true)
  const [targetMtValue, setTargetMtValue] = useState(initialTarget?.stats.mt ?? 0)
  const [lifeElementEnabled, setLifeElementEnabled] = useState(false)
  const [extraAuraElementEnabled, setExtraAuraElementEnabled] = useState(false)
  const [extraAuraMultiplier, setExtraAuraMultiplier] = useState("1x")
  const [auraMultiplier, setAuraMultiplier] = useState("1x")
  const [lifeMultiplier, setLifeMultiplier] = useState("1x")
  const [extraAuraBreak, setExtraAuraBreak] = useState("1x")
  const [auraBreak, setAuraBreak] = useState("1/2")
  const [result, setResult] = useState<{ tone: "good" | "bad" | "neutral"; title: string; detail: string } | null>(null)
  const [pendingDamage, setPendingDamage] = useState<{ signature: string; amount: number; damageTypeId: string; damageTypeName: string; damages: Array<{ amount: number; damageTypeId: string; damageTypeName: string }>; targetId: string; character: Character | null; title: string; detail: string } | null>(null)
  const [activeRoll, setActiveRoll] = useState<SkillRoll | null>(null)
  const makeDamageSignature = (expression: string, attackerMtEnabled: boolean) => [actor.id, targetId, expression, modifier, attackerMtEnabled, targetRdf, targetRdm, targetMtEnabled, targetMtValue, lifeElementEnabled, extraAuraElementEnabled, extraAuraMultiplier, auraMultiplier, lifeMultiplier, extraAuraBreak, auraBreak].join("|")
  const damageSignature = makeDamageSignature(damageExpression, mtEnabled)
  const simulatedDamage = pendingDamage?.signature === damageSignature ? pendingDamage : null

  const damageItems = actor.character.inventory.filter((item) => item.usage === "equipped" && (item.type === "weapon" || item.type === "shield" || item.type === "innate") && item.damage.trim())
  const usableSkills = actor.character.skills.filter((skill) => skill.attributeKey)

  // Selecionar outro token no RunasVTT troca o alvo, como escolher no seletor.
  const seenPreferredTargetId = useRef<string | null>(null)
  useEffect(() => {
    if (preferredTargetId === seenPreferredTargetId.current) return
    seenPreferredTargetId.current = preferredTargetId
    if (preferredTargetId && preferredTargetId !== targetId && targets.some((candidate) => candidate.id === preferredTargetId)) selectDamageTarget(preferredTargetId)
    // `targets` é recriado pelo painel a cada atualização; a seleção é a única
    // mudança externa que deve reposicionar o alvo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredTargetId])

  function selectDamageTarget(nextId: string) {
    setTargetId(nextId)
    setPendingDamage(null)
    const target = targets.find((candidate) => candidate.id === nextId)
    if (!target) return
    setTargetRdf(target.character.stats.armorRdf + target.character.stats.naturalRdf)
    setTargetRdm(target.character.stats.armorRdm + target.character.stats.naturalRdm)
    setTargetMtValue(target.character.stats.mt)
  }

  function runTest(requestedSkill?: CharacterSkill, context?: string) {
    const attributeKey = requestedSkill?.attributeKey || testAttribute
    const requestedName = requestedSkill?.name ?? skillName
    const requestedModifier = requestedSkill?.modifier ?? skillModifier
    if (!attributeKey) { setResult({ tone: "bad", title: "Teste sem atributo", detail: `Vincule um atributo à perícia ${requestedName}.` }); return }
    if (requestedSkill) {
      setMode("test")
      setTestAttribute(attributeKey)
      setSkillName(requestedName)
      setSkillModifier(requestedModifier)
      setPendingDamage(null)
    }
    const roll = rollSkillTest({ config: { attributeKey, skillName: requestedName, skillModifier: requestedModifier, masterModifier: 0, otherModifiers: 0, specialDieId: specialDie }, attributes: actor.character.attributes })
    if (!roll) return
    const total = applyQuickModifier(roll.totalTest, modifier)
    const margin = total - roll.diceSum
    const outcome: SkillRollOutcome = roll.diceRolls[0] === 1 && roll.diceRolls[1] === 1 ? "critical-success" : roll.diceRolls[0] === 10 && roll.diceRolls[1] === 10 ? "critical-failure" : margin >= 0 ? "success" : "failure"
    const adjusted = { ...roll, totalTest: total, totalModifiers: roll.totalModifiers + total - roll.totalTest, margin, outcome }
    setActiveRoll(adjusted)
    showSkillRoll(adjusted, context)
    requestAnimationFrame(() => calculatorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }))
  }

  function showSkillRoll(roll: SkillRoll, context?: string) {
    const title = `${context ? `${context} · ` : ""}${outcomeLabel(roll.outcome)} ${roll.margin >= 0 ? "+" : ""}${roll.margin}`
    const detail = `${roll.skillName}: teste ${roll.totalTest} contra ${roll.diceRolls.join(" + ")} = ${roll.diceSum}`
    setResult({ tone: roll.outcome.includes("success") ? "good" : "bad", title, detail })
    onLog?.({ kind: "test", title: `${actor.character.name}: ${title}`, detail, tokenId: actor.id, floatingText: `${outcomeLabel(roll.outcome)} ${roll.margin >= 0 ? "+" : ""}${roll.margin}` })
  }

  function spendDetermination() {
    if (!activeRoll || actor.character.stats.determination <= 0 || activeRoll.outcome.includes("critical")) return
    const modified = applyDeterminationToRoll(activeRoll)
    const next = cloneCharacter(actor.character)
    next.stats.determination -= 1
    onUpdate(next)
    setActiveRoll(modified)
    showSkillRoll(modified, "Determinação")
  }

  function spendCasualty() {
    if (!activeRoll || actor.character.stats.casualty <= 0) return
    const isChance = normalizeSkillName(activeRoll.skillName) === "acaso"
    if (!isChance && activeRoll.outcome.includes("critical")) return
    const rerolled = rollSkillTest({ config: { attributeKey: activeRoll.attributeKey, skillName: activeRoll.skillName, skillModifier: activeRoll.skillModifier, masterModifier: activeRoll.masterModifier, otherModifiers: activeRoll.otherModifiers, specialDieId: activeRoll.specialDieId }, attributes: actor.character.attributes })
    if (!rerolled) return
    const quickTotal = applyQuickModifier(rerolled.totalTest, modifier)
    const quickMargin = quickTotal - rerolled.diceSum
    const quickOutcome: SkillRollOutcome = rerolled.diceRolls[0] === 1 && rerolled.diceRolls[1] === 1 ? "critical-success" : rerolled.diceRolls[0] === 10 && rerolled.diceRolls[1] === 10 ? "critical-failure" : quickMargin >= 0 ? "success" : "failure"
    const quickAdjusted = { ...rerolled, totalTest: quickTotal, totalModifiers: rerolled.totalModifiers + quickTotal - rerolled.totalTest, margin: quickMargin, outcome: quickOutcome } as SkillRoll
    const adjustedReroll = applyDeterminationUsesToRoll(quickAdjusted, activeRoll.determinationUses)
    const chosen = isChance && compareSkillRolls(activeRoll, adjustedReroll) > 0 ? activeRoll : adjustedReroll
    const next = cloneCharacter(actor.character)
    next.stats.casualty -= 1
    onUpdate(next)
    setActiveRoll(chosen)
    showSkillRoll(chosen, isChance && chosen.id === activeRoll.id ? "Casualidade · melhor resultado mantido" : "Casualidade")
  }

  function stageDamages(damages: Array<{ amount: number; damageTypeId: string; damageTypeName: string }>, signature = damageSignature) {
    setActiveRoll(null)
    const normalized = damages.map((damage) => ({ ...damage, amount: Math.max(0, Math.trunc(Number.isFinite(damage.amount) ? damage.amount : 0)) }))
    const principal = normalized[0]
    if (!principal) return
    const title = normalized.map((damage) => `${damage.amount} ${damage.damageTypeName}`).join(" + ")
    const target = targets.find((candidate) => candidate.id === targetId)
    if (!target) {
      setPendingDamage({ signature, amount: principal.amount, damageTypeId: principal.damageTypeId, damageTypeName: principal.damageTypeName, damages: normalized, targetId: "", character: null, title, detail: `${title} · selecione um alvo da mesa para calcular resistências e recursos.` })
      return
    }
    const stats = target.character.stats
    const snapshot = calculateCharacterStatSnapshot(target.character.attributes, target.character.info, stats, target.character.skills, target.character.abilities)
    const element = getCharacterElement(stats.elementId)
    const resistances = [...new Set([...(element?.resistances ?? []), ...stats.resistances])]
    const weaknesses = [...new Set([...(element?.weaknesses ?? []), ...stats.weaknesses])]
    const simulation = simulateDamageApplications({ damages: normalized.map(({ amount, damageTypeId }) => ({ amount, damageTypeId })), mtEnabled: targetMtEnabled, mtValue: targetMtValue, rdf: targetRdf, rdm: targetRdm, attributeBonuses: { vitality: target.character.attributes.vitality, power: target.character.attributes.power, faith: target.character.attributes.faith, luck: target.character.attributes.luck }, layers: [
      { resource: "paExtra", current: stats.paExtra, resistances: extraAuraElementEnabled ? resistances : [], weaknesses: extraAuraElementEnabled ? weaknesses : [], multiplier: extraAuraMultiplier, breakMultiplier: extraAuraBreak },
      { resource: "pa", current: stats.pa, resistances, weaknesses, multiplier: auraMultiplier, breakMultiplier: auraBreak },
      { resource: "pv", current: stats.pv, maximum: snapshot.pvMax, resistances: lifeElementEnabled ? resistances : [], weaknesses: lifeElementEnabled ? weaknesses : [], multiplier: lifeMultiplier },
    ] })
    if (!simulation.value) { setPendingDamage(null); setResult({ tone: "bad", title: "Não foi possível simular", detail: simulation.error ?? "Revise o dano." }); return }
    const next = cloneCharacter(target.character)
    for (const change of simulation.value.changes) {
      const value = next.stats[change.resource] + change.amount
      next.stats[change.resource] = change.resource === "pv" ? value : Math.max(0, value)
    }
    const detail = [simulation.value.resultText, ...simulation.value.notices].filter(Boolean).join(" · ")
    const preview = { signature, amount: principal.amount, damageTypeId: principal.damageTypeId, damageTypeName: principal.damageTypeName, damages: normalized, targetId: target.id, character: next, title, detail: `${target.character.name} #${target.copyNumber}: ${detail}` }
    setPendingDamage(preview)
  }

  function updatePendingDamageAmount(index: number, amount: number) {
    if (!pendingDamage) return
    const damages = pendingDamage.damages.map((damage, damageIndex) => damageIndex === index ? { ...damage, amount } : damage)
    if (!simulationEditing) {
      stageDamages(damages, pendingDamage.signature)
      return
    }
    const principal = damages[0]
    setPendingDamage((current) => current ? {
      ...current,
      amount: principal.amount,
      damageTypeId: principal.damageTypeId,
      damageTypeName: principal.damageTypeName,
      damages,
      title: damages.map((damage) => `${damage.amount} ${damage.damageTypeName}`).join(" + "),
    } : current)
  }

  function simulateDamage(requestedExpression = damageExpression, requestedMt = mtEnabled, requestedMtValue = actor.character.stats.mt) {
    setSimulationEditing(false)
    const parsed = parseDamageExpressions(requestedExpression)
    if (!parsed.length || parsed.some((part) => !part.damageTypeId)) { setResult({ tone: "bad", title: "Dano incompleto", detail: "Use algo como 2D cortante, 3D congelante adicional." }); return }
    const sequence = calculateDamageSequence(parsed.map((part) => {
      const attributeValue = part.attributeKey ? actor.character.attributes[part.attributeKey] : 0
      const conversion = convertDamageBonusesToDice(part.numDice, [attributeValue, part.bonus])
      return { config: { numDice: part.numDice, damageTypeId: part.damageTypeId!, attributeKey: part.attributeKey ?? "none", otherModifier: part.bonus, mtEnabled: requestedMt, mtValue: requestedMtValue, otherMultiplier: "1", rdf: 0, rdm: 0 }, diceRolls: part.numDice > 0 ? rollDice(conversion.numDice) : [], attributeValue }
    }), 0, 0)
    stageDamages(sequence.results.map((calculated) => ({ amount: applyQuickModifier(calculated.total, modifier), damageTypeId: calculated.damageTypeId, damageTypeName: calculated.damageTypeName })), makeDamageSignature(requestedExpression, requestedMt))
  }

  /**
   * O bônus do item entra na própria expressão; o MT não multiplica mais o
   * dano, porque com `Usar MT?` ativo ele já virou bônus pela diferença para
   * o MT do personagem.
   */
  function rollItemDamage(item: Character["inventory"][number]) {
    const expression = composeItemDamageExpression(item.damage, calculateItemDamageBonus(item, actor.character.info.sizeModifier).total)
    setMode("damage")
    setDamageExpression(expression)
    setMtEnabled(false)
    setPendingDamage(null)
    simulateDamage(expression, false, 0)
    requestAnimationFrame(() => calculatorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }))
  }

  function castSpell(spell: CharacterSpell) {
    const normalized = spell.castingSkill.trim().toLocaleLowerCase("pt-BR")
    const skill = normalized ? actor.character.skills.find((candidate) => candidate.name.trim().toLocaleLowerCase("pt-BR") === normalized) : undefined
    if (!skill) {
      setResult({ tone: "bad", title: `Não foi possível conjurar ${spell.name}`, detail: spell.castingSkill ? `A perícia “${spell.castingSkill}” não foi encontrada nesta ficha.` : "Informe uma perícia de conjuração na magia." })
      return
    }
    runTest(skill, `Conjuração de ${spell.name}`)
  }

  function confirmDamage() {
    if (!simulatedDamage?.character || !simulatedDamage.targetId) return
    onUpdateTarget(simulatedDamage.targetId, simulatedDamage.character)
    setResult({ tone: "good", title: `Dano aplicado ao alvo: ${simulatedDamage.title}`, detail: simulatedDamage.detail })
    const target = targets.find((candidate) => candidate.id === simulatedDamage.targetId)
    if (target) onLog?.({ kind: "damage", title: `${actor.character.name} → ${target.character.name}: ${simulatedDamage.title}`, detail: simulatedDamage.detail, tokenId: target.id, floatingText: `-${resourceLoss(target.character, simulatedDamage.character)}` })
    setPendingDamage(null)
  }

  return <div className="quick-actions"><div className="dock-title"><div><p className="eyebrow">Ações integradas</p><h2>{actor.character.name} #{actor.copyNumber}</h2></div><Bolt size={20} /></div><div className="actor-action-library">{damageItems.length > 0 && <ActionGroup title="Equipamentos" tone="damage">{damageItems.map((item) => { const linkedSkill = actor.character.skills.find((skill) => skill.id === item.skillId); return <article className="equipment-action" key={item.id}><span><strong>{item.name}</strong><small>{item.damage}{linkedSkill ? ` · ${linkedSkill.name}` : " · sem perícia vinculada"}</small></span><div><button onClick={() => rollItemDamage(item)}><Swords size={13} /> Dano</button><button disabled={!linkedSkill?.attributeKey} title={linkedSkill?.attributeKey ? `Rolar ${linkedSkill.name}` : "Vincule uma perícia ao equipamento na ficha"} onClick={() => linkedSkill && runTest(linkedSkill)}><Shield size={13} /> Teste</button></div></article> })}</ActionGroup>}{usableSkills.length > 0 && <ActionGroup title="Perícias" tone="test">{usableSkills.map((skill) => <button key={skill.id} onClick={() => runTest(skill)}><span><strong>{skill.name}</strong><small>{secondaryAttributes.find((attribute) => attribute.key === skill.attributeKey)?.label ?? "Teste"} · mod. {skill.modifier}</small></span><b><Shield size={13} /> Rolar teste</b></button>)}</ActionGroup>}{actor.character.spells.length > 0 && <ActionGroup title="Magias" tone="spell">{actor.character.spells.map((spell) => <button key={spell.id} onClick={() => castSpell(spell)}><span><strong>{spell.name}</strong><small>{spell.category || spell.magicType} · {spell.castingSkill || "sem perícia"}</small></span><b><Sparkles size={13} /> Conjurar</b></button>)}</ActionGroup>}</div><div className="mode-tabs" ref={calculatorRef}><button className={mode === "damage" ? "active" : ""} onClick={() => { setMode("damage"); setResult(null) }}><Swords size={16} /> Dano</button><button className={mode === "test" ? "active" : ""} onClick={() => { setMode("test"); setResult(null) }}><Shield size={16} /> Teste</button></div>
    {mode === "damage" ? <div className="quick-form"><label><span>Dano rápido</span><input value={damageExpression} onChange={(event) => setDamageExpression(event.target.value)} placeholder="3D+2 cortante" /></label><label className="damage-target-field"><span>Alvo da simulação</span><select value={targetId} onChange={(event) => selectDamageTarget(event.target.value)}><option value="">Apenas calcular o dano causado</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.character.name} #{target.copyNumber}{target.id === actor.id ? " (o próprio personagem)" : ""}</option>)}</select></label>{advancedOpen && <div className="advanced-panel damage-advanced"><div className="advanced-group-title"><strong>Redução e escala do alvo</strong><small>Mesmas camadas da aplicação completa</small></div><label><span>RDF</span><DeferredNumberInput value={targetRdf} min={0} onChange={setTargetRdf} /></label><label><span>RDM</span><DeferredNumberInput value={targetRdm} min={0} onChange={setTargetRdm} /></label><label className="check-row"><input type="checkbox" checked={mtEnabled} onChange={(event) => setMtEnabled(event.target.checked)} /> Aplicar MT do atacante na rolagem</label><label className="check-row"><input type="checkbox" checked={targetMtEnabled} onChange={(event) => setTargetMtEnabled(event.target.checked)} /> Aplicar MT do alvo</label>{targetMtEnabled && <label><span>MT do alvo</span><DeferredNumberInput value={targetMtValue} onChange={setTargetMtValue} /></label>}<div className="damage-layer extra"><strong>PA Extra</strong><label className="check-row"><input type="checkbox" checked={extraAuraElementEnabled} onChange={(event) => setExtraAuraElementEnabled(event.target.checked)} /> Usar elemento</label><label><span>Multiplicador</span><input value={extraAuraMultiplier} onChange={(event) => setExtraAuraMultiplier(event.target.value)} /></label><label><span>Quebra</span><input value={extraAuraBreak} onChange={(event) => setExtraAuraBreak(event.target.value)} /></label></div><div className="damage-layer aura"><strong>PA</strong><small>{getCharacterElement(targets.find((target) => target.id === targetId)?.character.stats.elementId ?? "none")?.name ?? "Sem elemento"}</small><label><span>Multiplicador</span><input value={auraMultiplier} onChange={(event) => setAuraMultiplier(event.target.value)} /></label><label><span>Quebra</span><input value={auraBreak} onChange={(event) => setAuraBreak(event.target.value)} /></label></div><div className="damage-layer life"><strong>PV</strong><label className="check-row"><input type="checkbox" checked={lifeElementEnabled} onChange={(event) => setLifeElementEnabled(event.target.checked)} /> Usar elemento na vida</label><label><span>Multiplicador</span><input value={lifeMultiplier} onChange={(event) => setLifeMultiplier(event.target.value)} /></label></div><p>Resistências e fraquezas do elemento são combinadas com as personalizadas da ficha.</p></div>}<ConfigurationButtons modifierOpen={modifierOpen} advancedOpen={advancedOpen} onModifier={() => setModifierOpen((value) => !value)} onAdvanced={() => setAdvancedOpen((value) => !value)} />{modifierOpen && <ModifierInput value={modifier} onChange={setModifier} />}<button className="execute-button damage" onClick={() => simulateDamage()}>Simular dano</button>{simulatedDamage && <div className="damage-confirmation"><div className="damage-caused-list"><span>Danos causados</span>{simulatedDamage.damages.map((damage, damageIndex) => <label key={`${damage.damageTypeId}-${damageIndex}`}><small>{damageIndex === 0 ? "Principal" : `Adicional ${damageIndex}`}</small><DeferredNumberInput ariaLabel={`Valor do ${damageIndex === 0 ? "dano principal" : `dano adicional ${damageIndex}`}`} value={damage.amount} min={0} onChange={(amount) => updatePendingDamageAmount(damageIndex, amount)} /><b>{damage.damageTypeName}</b></label>)}</div><div className="simulated-damage-editor"><div><span>Dano simulado</span><button className={simulationEditing ? "active" : ""} onClick={() => { if (simulationEditing) { setSimulationEditing(false); stageDamages(simulatedDamage.damages, simulatedDamage.signature) } else setSimulationEditing(true) }}>{simulationEditing ? "Bloquear e recalcular" : "Editar texto"}</button></div><textarea aria-label="Dano simulado" readOnly={!simulationEditing} value={simulatedDamage.detail} onChange={(event) => setPendingDamage((current) => current ? { ...current, detail: event.target.value } : current)} /></div><button className="execute-button confirm" disabled={!simulatedDamage.character || simulationEditing} onClick={confirmDamage}>{simulatedDamage.character ? "Aplicar dano ao alvo" : "Selecione um alvo para aplicar"}</button></div>}</div> : <div className="quick-form"><label><span>Perícia ou teste</span><input value={skillName} onChange={(event) => setSkillName(event.target.value)} /></label>{advancedOpen && <div className="advanced-panel"><label><span>Atributo</span><select value={testAttribute} onChange={(event) => setTestAttribute(event.target.value as SecondaryAttributeKey)}>{secondaryAttributes.map((attribute) => <option key={attribute.key} value={attribute.key}>{attribute.label}</option>)}</select></label><label><span>Mod. da perícia</span><DeferredNumberInput value={skillModifier} onChange={setSkillModifier} /></label><label><span>Dado especial</span><select value={specialDie} onChange={(event) => setSpecialDie(event.target.value as SpecialDieId)}><option value="none">Nenhum</option><option value="luck">Sorte</option><option value="inspiration">Inspiração</option><option value="legendary-inspiration">Inspiração lendária</option><option value="divine-advantage">Divino: vantagem</option><option value="divine-disadvantage">Divino: desvantagem</option></select></label></div>}<ConfigurationButtons modifierOpen={modifierOpen} advancedOpen={advancedOpen} onModifier={() => setModifierOpen((value) => !value)} onAdvanced={() => setAdvancedOpen((value) => !value)} />{modifierOpen && <ModifierInput value={modifier} onChange={setModifier} />}<button className="execute-button test" onClick={() => runTest()}>Rolar teste</button></div>}
    {result && <div className={`roll-result ${result.tone}`}><strong>{result.title}</strong><span>{result.detail}</span></div>}{mode === "test" && activeRoll && <div className="narrative-spend"><button onClick={spendDetermination} disabled={actor.character.stats.determination <= 0 || activeRoll.outcome.includes("critical")}><b>Determinação</b><span>+{normalizeSkillName(activeRoll.skillName) === "vontade" ? 3 : 1} no teste · {actor.character.stats.determination} restante</span></button><button onClick={spendCasualty} disabled={actor.character.stats.casualty <= 0 || (normalizeSkillName(activeRoll.skillName) !== "acaso" && activeRoll.outcome.includes("critical"))}><b>Casualidade</b><span>Rolar novamente · {actor.character.stats.casualty} restante</span></button></div>}<p className="modifier-hint"><b>Modificador:</b> inteiros somam; x2 multiplica; x0,5 divide por dois.</p></div>
}

function ActionGroup({ title, tone, children }: { title: string; tone: "damage" | "test" | "spell"; children: React.ReactNode }) {
  return <details className={`action-group ${tone}`} open={tone === "damage"}><summary><span>{title}</span><ChevronDown size={14} /></summary><div>{children}</div></details>
}

function ConfigurationButtons({ modifierOpen, advancedOpen, onModifier, onAdvanced }: { modifierOpen: boolean; advancedOpen: boolean; onModifier: () => void; onAdvanced: () => void }) {
  return <div className="configuration-buttons"><button className={modifierOpen ? "active" : ""} onClick={onModifier}>± Modificador</button><button className={advancedOpen ? "active" : ""} onClick={onAdvanced}>Avançado <ChevronDown size={14} /></button></div>
}

function ModifierInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="modifier-input"><span>Modificador final</span><input autoFocus value={value} onChange={(event) => onChange(event.target.value)} placeholder="+3, -2, x2 ou x0,5" /></label>
}

/** `onSendToVtt`: dentro do RunasVTT, "Exportar ficha" envia a ficha como token em vez de baixar o JSON. */
function SheetEditor({ entry, tables, onClose, onSave, onTablesChange, onSendToVtt }: { entry: BestiaryEntry; tables: MasteryTable[]; onClose: () => void; onSave: (entry: BestiaryEntry) => void; onTablesChange: (tables: MasteryTable[]) => void; onSendToVtt?: (character: Character, masteryTableId: string) => void }) {
  useEscapeToClose(onClose)
  const [character, setCharacter] = useState(() => cloneCharacter(entry.character))
  const [tab, setTab] = useState<"simple" | "advanced">("simple")
  const [tableId, setTableId] = useState(() => tables.some((table) => table.id === entry.masteryTableId) ? entry.masteryTableId : "default")
  const [simpleWidth, setSimpleWidth] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState({ attributes: false, statistics: false, connections: false, resources: false })
  const [portraitFile, setPortraitFile] = useState<File | null>(null)
  const resizeState = useRef<{ pointerId: number; startX: number; startWidth: number; side: "left" | "right" } | null>(null)
  const selectedTable = tables.find((table) => table.id === tableId) ?? tables[0]
  const snapshot = calculateCharacterStatSnapshot(character.attributes, character.info, character.stats, character.skills, character.abilities)
  const availableMastery = calculateMasteryImprovementPoints(character.info) * (selectedTable?.multiplier ?? 1)
  const spentMastery = calculateSpentMasteryImprovementPoints(character.stats.masteryImprovements)
  const remainingMastery = availableMastery - spentMastery

  function mutate(updater: (draft: Character) => void) {
    setCharacter((current) => { const next = cloneCharacter(current); updater(next); return synchronizeCharacterDerivedValues(current, next) })
  }

  function save() {
    onSave({ ...entry, character, masteryTableId: tableId })
  }

  function switchTab(next: "simple" | "advanced") {
    setTab(next)
  }

  function restoreStats() {
    mutate((draft) => {
      draft.stats.pv = snapshot.pvMax
      draft.stats.pa = snapshot.paMax
      draft.stats.paExtra = snapshot.paExtraMax
      draft.stats.pe = snapshot.peMax
      draft.stats.peTemporary = snapshot.peTemporaryMax
      draft.stats.determination = snapshot.determinationMax
      draft.stats.casualty = snapshot.casualtyMax
      draft.stats.focusCurrent = snapshot.focusMaximum
    })
  }

  function toggleSection(section: keyof typeof collapsed) {
    setCollapsed((current) => ({ ...current, [section]: !current[section] }))
  }

  function beginResize(event: React.PointerEvent<HTMLButtonElement>, side: "left" | "right") {
    const modal = event.currentTarget.closest<HTMLElement>(".sheet-modal")
    if (!modal) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeState.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: modal.getBoundingClientRect().width, side }
  }

  function resize(event: React.PointerEvent<HTMLButtonElement>) {
    const current = resizeState.current
    if (!current || current.pointerId !== event.pointerId) return
    const movement = (current.side === "right" ? event.clientX - current.startX : current.startX - event.clientX) * 2
    setSimpleWidth(clampSimpleSheetWidth(current.startWidth + movement, window.innerWidth))
  }

  function finishResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (resizeState.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    resizeState.current = null
  }

  function resizeWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    const modal = event.currentTarget.closest<HTMLElement>(".sheet-modal")
    if (!modal) return
    event.preventDefault()
    const delta = event.key === "ArrowRight" ? 32 : -32
    setSimpleWidth(clampSimpleSheetWidth(modal.getBoundingClientRect().width + delta, window.innerWidth))
  }

  const modalStyle = tab === "simple" && simpleWidth !== null
    ? ({ "--simple-sheet-width": `${simpleWidth}px` } as React.CSSProperties)
    : undefined

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section style={modalStyle} className={`sheet-modal ${tab === "advanced" ? "advanced-mode" : "simple-mode"}`} role="dialog" aria-modal="true" aria-label="Editor de ficha">
    {tab === "simple" && <><ResizeHandle side="left" onPointerDown={beginResize} onPointerMove={resize} onPointerUp={finishResize} onKeyDown={resizeWithKeyboard} /><ResizeHandle side="right" onPointerDown={beginResize} onPointerMove={resize} onPointerUp={finishResize} onKeyDown={resizeWithKeyboard} /></>}
    <header><div><p className="eyebrow">{entry.character.name ? "Editar criatura" : "Nova criatura"}</p><h2>{character.name || "Ficha sem nome"}</h2></div><div className="editor-tabs"><button className={tab === "simple" ? "active" : ""} onClick={() => switchTab("simple")}>Simplificada</button><button className={tab === "advanced" ? "active" : ""} onClick={() => switchTab("advanced")}>Avançada</button></div><button className="icon-button" onClick={onClose}><X size={20} /></button></header>
    {tab === "simple" ? <div className="editor-body simple-sheet-editor"><section className="form-section hero-fields simple-identity-card"><div className={`editor-rune portrait-editor ${characterImage(character) ? "has-portrait" : ""}`}>{characterImage(character) ? <img src={characterImage(character)} alt={`Imagem de ${character.name || "criatura"}`} /> : <><span>{character.name.slice(0, 1) || "R"}</span><small>RUNAS</small></>}<label title="Escolher imagem do token"><Upload size={14} /><span className="sr-only">Escolher imagem do token</span><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file?.type.startsWith("image/")) setPortraitFile(file); event.currentTarget.value = "" }} /></label>{characterImage(character) && <button aria-label="Remover token da ficha" title={character.tokenImageDataUrl ? "Remover token" : "Remover retrato"} onClick={() => mutate((draft) => { if (draft.tokenImageDataUrl) delete draft.tokenImageDataUrl; else delete draft.portraitDataUrl })}><Trash2 size={13} /><span className="sr-only">Remover token</span></button>}</div><Field label="Nome" value={character.name} onChange={(value) => mutate((draft) => { draft.name = value })} /><Field label="Raça" value={character.info.race} onChange={(value) => mutate((draft) => { draft.info.race = value })} /><Field label="Afinidade" value={character.info.affinity} onChange={(value) => mutate((draft) => { draft.info.affinity = value })} /><PercentField label="Eficiência" value={character.info.efficiency} onChange={(value) => mutate((draft) => { draft.info.efficiency = value })} /><Field label="Essências totais" value={character.info.essences} onChange={(value) => mutate((draft) => { draft.info.essences = value })} /></section>
      <SimpleSection className="attribute-section" title="Atributos" note="Organização histórica do sistema Runas" collapsed={collapsed.attributes} onToggle={() => toggleSection("attributes")}><AttributeBands attributes={character.attributes} onChange={(key: AttributeKey, value) => mutate((draft) => { draft.attributes[key] = value })} /></SimpleSection>
      <SimpleSection className="statistics-section" title="Estatísticas" collapsed={collapsed.statistics} onToggle={() => toggleSection("statistics")} action={<button className="restore-stats-button simple" onClick={restoreStats}><RefreshCw size={14} /> Restaurar estatísticas</button>}><div className="field-grid six resource-ribbon"><ResourceField label="PV" value={character.stats.pv} maximum={snapshot.pvMax} onChange={(value) => mutate((draft) => { draft.stats.pv = value })} /><ResourceField label="PA" value={character.stats.pa} maximum={snapshot.paMax} onChange={(value) => mutate((draft) => { draft.stats.pa = value })} /><ResourceField label="PA extra" value={character.stats.paExtra} maximum={snapshot.paExtraMax} onChange={(value) => mutate((draft) => { draft.stats.paExtra = value })} /><ResourceField label="PE" value={character.stats.pe} maximum={snapshot.peMax} onChange={(value) => mutate((draft) => { draft.stats.pe = value })} /><ResourceField label="PE temporário" value={character.stats.peTemporary} maximum={snapshot.peTemporaryMax} onChange={(value) => mutate((draft) => { draft.stats.peTemporary = value })} /><div className="calculated-field"><span>Deslocamento</span><strong>{snapshot.movement} m</strong></div></div><div className="field-grid defense-grid"><label className="field"><span>Elemento principal</span><select value={character.stats.elementId} onChange={(event) => mutate((draft) => { const element = getCharacterElement(event.target.value); draft.stats.elementId = event.target.value; draft.stats.resistances = [...(element?.resistances ?? [])]; draft.stats.weaknesses = [...(element?.weaknesses ?? [])] })}><option value="none">Nenhum</option>{characterElements.map((element) => <option key={element.id} value={element.id}>{element.name}</option>)}</select></label><Field label="Resistências" value={character.stats.resistances.join(", ")} onChange={(value) => mutate((draft) => { draft.stats.resistances = listFromText(value) })} /><Field label="Fraquezas" value={character.stats.weaknesses.join(", ")} onChange={(value) => mutate((draft) => { draft.stats.weaknesses = listFromText(value) })} /></div><section className="compact-mastery"><div className="compact-mastery-title"><div><h4>Melhorias</h4><span>Pontos definidos por Afinidade, Eficiência e tabela selecionada.</span></div><MasterySummary total={availableMastery} spent={spentMastery} remaining={remainingMastery} /></div><div className="mastery-toolbar"><select value={tableId} onChange={(event) => setTableId(event.target.value)}>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select><button className="secondary-button" onClick={() => { const table = { id: id("table"), name: `Tabela ${tables.length + 1}`, multiplier: 1 }; onTablesChange([...tables, table]); setTableId(table.id) }}><Plus size={15} /> Nova tabela</button>{selectedTable && !["default", "double"].includes(selectedTable.id) && <><input value={selectedTable.name} onChange={(event) => onTablesChange(tables.map((table) => table.id === selectedTable.id ? { ...table, name: event.target.value } : table))} /><label className="mini-field">Multiplicador <DeferredNumberInput value={selectedTable.multiplier} min={0.1} defaultValue={1} onChange={(multiplier) => onTablesChange(tables.map((table) => table.id === selectedTable.id ? { ...table, multiplier } : table))} /></label><button className="secondary-button danger-icon" title="Remover tabela customizada" onClick={() => { onTablesChange(tables.filter((table) => table.id !== selectedTable.id)); setTableId("default") }}><Trash2 size={15} /> Remover</button></>}</div><div className="mastery-grid">{masteryImprovementOptions.map((option) => { const current = character.stats.masteryImprovements[option.key]; const maximum = Math.floor(Math.max(0, remainingMastery + current * option.cost) / option.cost); return <NumberField key={option.key} label={`${option.name} / ${option.cost} pontos`} value={current} min={0} max={maximum} onChange={(next) => mutate((draft) => { draft.stats.masteryImprovements[option.key] = clampMasteryImprovementQuantity(draft.stats.masteryImprovements, option.key, next, availableMastery) })} /> })}</div>{remainingMastery < 0 && <p className="mastery-overage" role="alert">As melhorias excedem o limite da tabela. Reduza compras ou aumente os pontos disponíveis.</p>}</section></SimpleSection>
      <SimpleSection className="linked-section" title="Perícias, características e ações" note="Registros vinculados à ficha completa" collapsed={collapsed.connections} onToggle={() => toggleSection("connections")}><SimpleConnections character={character} mutate={mutate} /></SimpleSection>
      <SimpleSection className="inventory-section" title="Recursos" collapsed={collapsed.resources} onToggle={() => toggleSection("resources")}><SimpleInventory character={character} mutate={mutate} /></SimpleSection></div> : <AdvancedSheetEditor character={character} onChange={setCharacter} />}
    <footer className="modal-footer">{tab === "simple" && (onSendToVtt
      ? <button className="secondary-button export-current-sheet" onClick={() => onSendToVtt(character, tableId)}><Send size={16} /> Enviar ao RunasVTT</button>
      : <button className="secondary-button export-current-sheet" onClick={() => exportCharacterJson(character)}><Download size={16} /> Exportar ficha</button>)}<button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save}>Salvar ficha</button></footer>
    {portraitFile && <TokenEditorDialog file={portraitFile} initialSize={character.tokenSize ?? 1} onCancel={() => setPortraitFile(null)} onConfirm={(tokenImageDataUrl, tokenSize) => { mutate((draft) => { draft.tokenImageDataUrl = tokenImageDataUrl; draft.tokenSize = tokenSize }); setPortraitFile(null) }} />}
  </section></div>
}

type CharacterMutator = (updater: (draft: Character) => void) => void

const simpleCostOptions = [
  { value: "none", label: "Nenhum" }, { value: "other", label: "Outro" }, { value: "pv", label: "PV" },
  { value: "pa", label: "PA" }, { value: "pe", label: "PE" }, { value: "paExtra", label: "PA extra" },
  { value: "peTemporary", label: "PE temporário" },
] as const
const simpleMagicTypes = [
  { value: "aura", label: "Aura" }, { value: "quick", label: "Rápida" }, { value: "spell", label: "Feitiço" },
  { value: "ritual", label: "Ritual" }, { value: "enchantment", label: "Encantamento" },
] as const
const simpleRangeTypes = [
  { value: "touch", label: "Toque" }, { value: "personal", label: "Pessoal" }, { value: "projectile", label: "Projétil" },
  { value: "targets", label: "Alvo(s)" }, { value: "area", label: "Área" },
] as const

function ResizeHandle({ side, onPointerDown, onPointerMove, onPointerUp, onKeyDown }: { side: "left" | "right"; onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, side: "left" | "right") => void; onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void; onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void; onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void }) {
  function scrollSheet(event: React.WheelEvent<HTMLButtonElement>) {
    const editor = event.currentTarget.closest<HTMLElement>(".sheet-modal")?.querySelector<HTMLElement>(".editor-body")
    if (!editor) return
    event.preventDefault()
    editor.scrollBy({ left: event.deltaX, top: event.deltaY })
  }

  return <button type="button" className={`simple-resize-handle ${side}`} role="separator" aria-orientation="vertical" aria-label={`Redimensionar pela lateral ${side === "left" ? "esquerda" : "direita"}`} title="Arraste para redimensionar a ficha" onPointerDown={(event) => onPointerDown(event, side)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown} onWheel={scrollSheet}><span /></button>
}

function SimpleSection({ className, title, note, action, collapsed, onToggle, children }: { className: string; title: string; note?: string; action?: React.ReactNode; collapsed: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <section className={`form-section simple-sheet-section ${className} ${collapsed ? "collapsed" : ""}`}><div className="section-title simple-section-title"><div><h3>{title}</h3>{note && <span>{note}</span>}</div><div className="simple-section-actions">{action}<button type="button" className="collapse-section-button" onClick={onToggle} aria-expanded={!collapsed} aria-label={`${collapsed ? "Expandir" : "Minimizar"} ${title}`}><ChevronDown size={16} /></button></div></div>{!collapsed && <div className="simple-section-content">{children}</div>}</section>
}

function addQuickSkill(mutate: CharacterMutator) { mutate((draft) => { draft.skills.push({ id: id("skill"), name: "Nova perícia", attributeKey: "", points: 0, modifier: 0, locked: false }) }) }
function addQuickRacial(mutate: CharacterMutator) { mutate((draft) => { draft.abilities.push(createQuickAbility("Nova característica", "Racial")) }) }
function addQuickAbility(mutate: CharacterMutator) { mutate((draft) => { draft.abilities.push(createQuickAbility("Nova habilidade", "Combate")) }) }
function addQuickSpell(mutate: CharacterMutator) { mutate((draft) => { draft.spells.push(createQuickSpell()) }) }
function addQuickAttack(mutate: CharacterMutator) { mutate((draft) => { draft.inventory.push(createQuickItem("Novo ataque", "equipped", "weapon")) }) }

function SimpleConnections({ character, mutate }: { character: Character; mutate: CharacterMutator }) {
  const racials = character.abilities.filter((ability) => ability.category.toLocaleLowerCase("pt-BR") === "racial")
  const actionCount = character.abilities.length - racials.length + character.spells.length + character.inventory.filter((item) => item.usage === "equipped").length
  const visiblePanelCount = Number(character.skills.length > 0) + Number(racials.length > 0)
  return <><div className="empty-linked-actions">
    {character.skills.length === 0 && <button onClick={() => addQuickSkill(mutate)}><Plus size={13} /> Adicionar perícia</button>}
    {racials.length === 0 && <button onClick={() => addQuickRacial(mutate)}><Plus size={13} /> Adicionar característica</button>}
    {actionCount === 0 && <><button onClick={() => addQuickAbility(mutate)}><Plus size={13} /> Adicionar habilidade</button><button onClick={() => addQuickSpell(mutate)}><Plus size={13} /> Adicionar magia</button><button onClick={() => addQuickAttack(mutate)}><Plus size={13} /> Adicionar item equipado</button></>}
  </div>{visiblePanelCount > 0 && <div className={`simple-linked-grid ${visiblePanelCount === 1 ? "single" : ""}`}>{character.skills.length > 0 && <SimpleSkills character={character} mutate={mutate} />}{racials.length > 0 && <SimpleRacialAbilities character={character} mutate={mutate} />}</div>}<SimpleActions character={character} mutate={mutate} /></>
}

function SimpleSkills({ character, mutate }: { character: Character; mutate: CharacterMutator }) {
  return <LinkedPanel title="Perícias" count={character.skills.length} actions={<button onClick={() => addQuickSkill(mutate)}><Plus size={13} /> Adicionar</button>}>
    <datalist id="dm-system-skill-suggestions">{systemSkills.map((skill) => <option key={skill.name} value={skill.name} />)}</datalist>
    <div className="linked-skill-header" aria-hidden="true"><span>Nome</span><span>Atributo</span><span>Teste</span><span>Nível</span><span>Pontos</span><span>Mod.</span><span>Estado</span></div>
    {character.skills.map((skill) => { const level = calculateSkillLevel(skill.points); const test = skill.attributeKey ? calculateAttributeTest(character.attributes, skill.attributeKey) + level + skill.modifier : null; return <div className="linked-item skill" key={skill.id}><input aria-label={`Nome da perícia ${skill.name}`} list="dm-system-skill-suggestions" value={skill.name} readOnly={skill.locked} onChange={(event) => { const typedName = event.target.value; const detected = findExactSystemSkill(typedName); mutate((draft) => assignById(draft.skills, skill.id, detected ? { name: detected.name, attributeKey: detected.attributeKey } : { name: typedName })) }} /><select aria-label={`Atributo de ${skill.name}`} value={skill.attributeKey} onChange={(event) => mutate((draft) => assignById(draft.skills, skill.id, { attributeKey: event.target.value as SecondaryAttributeKey | "" }))}><option value="">—</option>{secondaryAttributes.map((attribute) => <option key={attribute.key} value={attribute.key}>{attribute.label.slice(0, 3)}</option>)}</select><output className="linked-test" aria-label={`Teste de ${skill.name}`}>{test ?? "—"}</output><output className="linked-test linked-level" aria-label={`Nível de ${skill.name}`}>{level}</output><DeferredNumberInput className="linked-number" ariaLabel={`Pontos de ${skill.name}`} value={skill.points} min={0} onChange={(points) => mutate((draft) => assignById(draft.skills, skill.id, { points }))} /><DeferredNumberInput className="linked-number" ariaLabel={`Modificador de ${skill.name}`} value={skill.modifier} onChange={(modifier) => mutate((draft) => assignById(draft.skills, skill.id, { modifier }))} />{skill.locked ? <span className="linked-lock">fixa</span> : <button className="linked-remove" title="Remover perícia" onClick={() => mutate((draft) => { draft.skills = draft.skills.filter((item) => item.id !== skill.id) })}><X size={13} /></button>}</div> })}
  </LinkedPanel>
}

function SimpleRacialAbilities({ character, mutate }: { character: Character; mutate: CharacterMutator }) {
  const racials = character.abilities.filter((ability) => ability.category.toLocaleLowerCase("pt-BR") === "racial")
  return <LinkedPanel title="Características raciais" count={racials.length} actions={<button onClick={() => addQuickRacial(mutate)}><Plus size={13} /> Adicionar</button>}>
    {racials.map((ability) => <SimpleAbilityRecord key={ability.id} ability={ability} kind="racial" mutate={mutate} />)}
  </LinkedPanel>
}

function SimpleActions({ character, mutate }: { character: Character; mutate: CharacterMutator }) {
  const abilities = character.abilities.filter((ability) => ability.category.toLocaleLowerCase("pt-BR") !== "racial")
  const runes = abilities.filter((ability) => ability.category.toLocaleLowerCase("pt-BR") === "runa")
  const otherAbilities = abilities.filter((ability) => ability.category.toLocaleLowerCase("pt-BR") !== "runa")
  const equippedItems = character.inventory.filter((item) => item.usage === "equipped")
  const count = abilities.length + character.spells.length + equippedItems.length
  if (count === 0) return null
  const records = [
    ...runes.map((ability) => <SimpleAbilityRecord key={`ability-${ability.id}`} ability={ability} kind="rune" mutate={mutate} />),
    ...equippedItems.map((item) => <SimpleEquippedRecord key={`item-${item.id}`} item={item} character={character} mutate={mutate} />),
    ...otherAbilities.map((ability) => <SimpleAbilityRecord key={`ability-${ability.id}`} ability={ability} kind="ability" mutate={mutate} />),
    ...character.spells.map((spell) => <SimpleSpellRecord key={`spell-${spell.id}`} spell={spell} mutate={mutate} />),
  ]
  return <LinkedPanel className="actions-panel" title="Ações e habilidades" count={count} actions={<div className="linked-add-group"><button onClick={() => addQuickAbility(mutate)}><Plus size={13} /> Habilidade</button><button onClick={() => addQuickSpell(mutate)}><Plus size={13} /> Magia</button><button onClick={() => addQuickAttack(mutate)}><Plus size={13} /> Ataque</button></div>} listClassName="linked-action-list">
    {records}
  </LinkedPanel>
}

function SimpleInventory({ character, mutate }: { character: Character; mutate: CharacterMutator }) {
  const resources = character.inventory.filter((item) => item.type !== "innate")
  const armor = character.inventory.find((item) => item.usage === "equipped" && item.equippedAsArmor)
  const defense = calculateEquippedArmorDefense(character.inventory)
  const armorCandidates = character.inventory.filter((item) => item.usage === "equipped")
  return <><div className="resource-actions"><button onClick={() => mutate((draft) => { draft.inventory.push(createQuickItem("Novo item", "stored", "other")) })}><Plus size={13} /> Adicionar Item</button><button onClick={() => mutate((draft) => { draft.inventory.push(createQuickItem("Novo recurso", "absent", "other")) })}><Plus size={13} /> Adicionar Recurso</button></div><label className="simple-armor-selector"><span><Shield size={14} /> Item usado como armadura</span><select value={armor?.id ?? ""} onChange={(event) => mutate((draft) => { draft.inventory.forEach((item) => { item.equippedAsArmor = item.usage === "equipped" && item.id === event.target.value }) })}><option value="">Nenhum</option>{armorCandidates.map((item) => <option key={item.id} value={item.id}>{item.name || "Item sem nome"}</option>)}</select><small>RDF {defense.rdf} · RDM {defense.rdm}</small></label><div className="essence-yield"><Sparkles size={16} aria-hidden="true" /><strong>Essências: {essenceYield(character)}</strong></div><div className="resource-inventory-list">{resources.length > 0 ? resources.map((item) => <SimpleInventoryItem key={item.id} item={item} character={character} mutate={mutate} />) : <p className="simple-empty-state">Nenhum item ou recurso cadastrado.</p>}</div></>
}

function SimpleInventoryItem({ item, character, mutate }: { item: Character["inventory"][number]; character: Character; mutate: CharacterMutator }) {
  const [open, setOpen] = useState(false)
  return <article className={`simple-inventory-item ${open ? "open" : ""}`}><div className="linked-item inventory"><select aria-label={`Uso de ${item.name}`} value={item.usage} onChange={(event) => mutate((draft) => assignById(draft.inventory, item.id, { usage: event.target.value as typeof item.usage }))}>{inventoryUsageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><div className="inventory-copy"><input aria-label={`Nome do item ${item.name}`} value={item.name} onChange={(event) => mutate((draft) => assignById(draft.inventory, item.id, { name: event.target.value }))} /><span>{plainTextSummary(item.description, 180) || "Sem descrição"}</span></div><DeferredNumberInput className="linked-number" ariaLabel={`Quantidade de ${item.name}`} value={item.quantity} min={1} defaultValue={1} onChange={(quantity) => mutate((draft) => assignById(draft.inventory, item.id, { quantity: Math.max(1, quantity) }))} /><button className="linked-edit" aria-expanded={open} title={open ? "Ocultar edição" : "Editar item"} onClick={() => setOpen((value) => !value)}><Edit3 size={13} /></button><button className="linked-remove" title="Remover item" onClick={() => mutate((draft) => { draft.inventory = draft.inventory.filter((candidate) => candidate.id !== item.id) })}><X size={13} /></button></div>{open && <SimpleItemDetails item={item} character={character} mutate={mutate} />}</article>
}

function SimpleEquippedRecord({ item, character, mutate }: { item: Character["inventory"][number]; character: Character; mutate: CharacterMutator }) {
  const [open, setOpen] = useState(false)
  const innate = item.type === "innate"
  return <article className={`simple-linked-record ${open ? "open" : ""}`}><div className="linked-item action summary"><span className={`linked-source equipped ${innate ? "innate" : ""}`}>{innate ? <span aria-hidden="true">🗡️</span> : <Swords size={13} />}{innate ? "Inata" : "Equipado"}</span><div className="linked-action-copy"><strong>{item.name}</strong><span>{plainTextSummary(item.description) || "Sem descrição"}</span></div><button className="linked-edit" aria-expanded={open} title="Editar item equipado" onClick={() => setOpen((value) => !value)}><Edit3 size={13} /></button><button className="linked-remove" title="Remover item equipado" onClick={() => mutate((draft) => { draft.inventory = draft.inventory.filter((candidate) => candidate.id !== item.id) })}><X size={13} /></button></div>{open && <SimpleItemDetails item={item} character={character} mutate={mutate} />}</article>
}

function SimpleAbilityRecord({ ability, kind, mutate }: { ability: Character["abilities"][number]; kind: "racial" | "rune" | "ability"; mutate: CharacterMutator }) {
  const [open, setOpen] = useState(false)
  const isInnate = kind === "ability" && ability.category.trim().toLocaleLowerCase("pt-BR") === "inata"
  const label = kind === "racial" ? "Racial" : kind === "rune" ? "Runa" : isInnate ? "Inata" : "Habilidade"
  return <article className={`simple-linked-record ${open ? "open" : ""}`}><div className="linked-item action summary"><span className={`linked-source ${kind} ${isInnate ? "innate" : ""}`}>{kind === "rune" ? <Sparkles size={13} /> : kind === "ability" ? <span className="linked-source-emoji" aria-hidden="true">{isInnate ? "🗡️" : "🌀"}</span> : null}{label}</span><div className="linked-action-copy"><strong>{ability.name}</strong>{kind !== "racial" && <span>{plainTextSummary(ability.description, 180) || "Sem descrição"}</span>}</div><button className="linked-edit" aria-expanded={open} title={`Editar ${label.toLocaleLowerCase("pt-BR")}`} onClick={() => setOpen((value) => !value)}><Edit3 size={13} /></button><button className="linked-remove" title={`Remover ${label.toLocaleLowerCase("pt-BR")}`} onClick={() => mutate((draft) => { draft.abilities = draft.abilities.filter((candidate) => candidate.id !== ability.id) })}><X size={13} /></button></div>{open && <SimpleAbilityDetails ability={ability} mutate={mutate} />}</article>
}

function SimpleSpellRecord({ spell, mutate }: { spell: CharacterSpell; mutate: CharacterMutator }) {
  const [open, setOpen] = useState(false)
  return <article className={`simple-linked-record ${open ? "open" : ""}`}><div className="linked-item action summary"><span className="linked-source spell"><Sparkles size={13} />Magia</span><div className="linked-action-copy"><strong>{spell.name}</strong><span>{plainTextSummary(spell.description, 180) || "Sem descrição"}</span></div><button className="linked-edit" aria-expanded={open} title="Editar magia" onClick={() => setOpen((value) => !value)}><Edit3 size={13} /></button><button className="linked-remove" title="Remover magia" onClick={() => mutate((draft) => { draft.spells = draft.spells.filter((candidate) => candidate.id !== spell.id) })}><X size={13} /></button></div>{open && <SimpleSpellDetails spell={spell} mutate={mutate} />}</article>
}

function SimpleAbilityDetails({ ability, mutate }: { ability: Character["abilities"][number]; mutate: CharacterMutator }) {
  return <div className="simple-record-details"><Field label="Nome" value={ability.name} onChange={(value) => mutate((draft) => assignById(draft.abilities, ability.id, { name: value }))} /><Field label="Categoria" value={ability.category} onChange={(value) => mutate((draft) => assignById(draft.abilities, ability.id, { category: value }))} /><RichTextEditor label="Descrição" value={ability.description} onChange={(description) => mutate((draft) => assignById(draft.abilities, ability.id, { description }))} className="wide" /><Field label="Modificadores permanentes" value={ability.permanentModifiers} onChange={(value) => mutate((draft) => assignById(draft.abilities, ability.id, { permanentModifiers: value }))} /><label className="field"><span>Recurso de custo</span><select value={ability.costType} onChange={(event) => mutate((draft) => assignById(draft.abilities, ability.id, { costType: event.target.value as typeof ability.costType }))}>{simpleCostOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="field"><span>Aplicação</span><select value={ability.costMode} onChange={(event) => mutate((draft) => assignById(draft.abilities, ability.id, { costMode: event.target.value as typeof ability.costMode }))}><option value="fixed">Fixo</option><option value="relative">Relativo</option></select></label><NumberField label="Valor" value={ability.costValue} onChange={(value) => mutate((draft) => assignById(draft.abilities, ability.id, { costValue: value }))} /><Field label="Custo em texto" value={ability.costText} onChange={(value) => mutate((draft) => assignById(draft.abilities, ability.id, { costText: value }))} /></div>
}

function SimpleSpellDetails({ spell, mutate }: { spell: CharacterSpell; mutate: CharacterMutator }) {
  return <div className="simple-record-details"><Field label="Nome" value={spell.name} onChange={(value) => mutate((draft) => assignById(draft.spells, spell.id, { name: value }))} /><Field label="Categoria" value={spell.category} onChange={(value) => mutate((draft) => assignById(draft.spells, spell.id, { category: value }))} /><label className="field"><span>Tipo de magia</span><select value={spell.magicType} onChange={(event) => mutate((draft) => assignById(draft.spells, spell.id, { magicType: event.target.value as typeof spell.magicType }))}>{simpleMagicTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="field"><span>Tipo de alcance</span><select value={spell.rangeType} onChange={(event) => mutate((draft) => assignById(draft.spells, spell.id, { rangeType: event.target.value as typeof spell.rangeType }))}>{simpleRangeTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><Field label="Alcance" value={spell.rangeText} onChange={(value) => mutate((draft) => assignById(draft.spells, spell.id, { rangeText: value }))} /><Field label="Área" value={spell.area} onChange={(value) => mutate((draft) => assignById(draft.spells, spell.id, { area: value }))} /><Field label="Duração" value={spell.duration} onChange={(value) => mutate((draft) => assignById(draft.spells, spell.id, { duration: value }))} /><Field label="Teste de conjuração" value={spell.castingSkill} onChange={(value) => mutate((draft) => assignById(draft.spells, spell.id, { castingSkill: value }))} /><RichTextEditor label="Descrição" value={spell.description} onChange={(description) => mutate((draft) => assignById(draft.spells, spell.id, { description }))} className="wide" /><label className="field"><span>Recurso de custo</span><select value={spell.costType} onChange={(event) => mutate((draft) => assignById(draft.spells, spell.id, { costType: event.target.value as typeof spell.costType }))}>{simpleCostOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="field"><span>Aplicação</span><select value={spell.costMode} onChange={(event) => mutate((draft) => assignById(draft.spells, spell.id, { costMode: event.target.value as typeof spell.costMode }))}><option value="fixed">Fixo</option><option value="relative">Relativo</option></select></label><NumberField label="Valor" value={spell.costValue} onChange={(value) => mutate((draft) => assignById(draft.spells, spell.id, { costValue: value }))} /><Field label="Custo em texto" value={spell.costText} onChange={(value) => mutate((draft) => assignById(draft.spells, spell.id, { costText: value }))} /></div>
}

function SimpleItemDetails({ item, character, mutate }: { item: Character["inventory"][number]; character: Character; mutate: CharacterMutator }) {
  // Mesmo recorte da criação simples do Tools: dano e perícia em armas, PR em
  // escudos, RDF/RDM em armaduras e escudos. O resto vive na ficha avançada.
  const isWeapon = item.type === "weapon"
  const hasDefense = item.type === "armor" || item.type === "shield"
  const bonus = calculateItemDamageBonus(item, character.info.sizeModifier)
  const testSources = listCharacterTestSources(character)
  const attach = (field: "abilityIds" | "spellIds", id: string) => mutate((draft) => { const entry = draft.inventory.find((candidate) => candidate.id === item.id); if (entry && !entry[field].includes(id)) entry[field].push(id) })
  const detach = (field: "abilityIds" | "spellIds", id: string) => mutate((draft) => { const entry = draft.inventory.find((candidate) => candidate.id === item.id); if (entry) entry[field] = entry[field].filter((candidate) => candidate !== id) })
  function createRecord(kind: "ability" | "spell", record: ImportedAbility | ImportedSpell): string {
    const recordId = `${kind}-${crypto.randomUUID()}`
    mutate((draft) => {
      if (kind === "ability") draft.abilities.push({ id: recordId, ...(record as ImportedAbility) })
      else draft.spells.push({ id: recordId, ...(record as ImportedSpell) })
    })
    return recordId
  }
  return <div className="simple-record-details simple-item-details">
    <Field label="Nome" value={item.name} onChange={(value) => mutate((draft) => assignById(draft.inventory, item.id, { name: value }))} />
    <label className="field"><span>Tipo</span><select value={item.type} onChange={(event) => mutate((draft) => assignById(draft.inventory, item.id, { type: event.target.value as typeof item.type }))}>{inventoryTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <NumberField label="Peso base" value={item.baseWeight} min={0} onChange={(value) => mutate((draft) => assignById(draft.inventory, item.id, { baseWeight: value }))} />
    <NumberField label="Tamanho (cm)" value={item.size} min={0} onChange={(value) => mutate((draft) => assignById(draft.inventory, item.id, { size: Math.max(0, value), mt: calculateItemSizeModifier(Math.max(0, value)) }))} />
    <NumberField label="Quantidade" value={item.quantity} min={1} onChange={(value) => mutate((draft) => assignById(draft.inventory, item.id, { quantity: Math.max(1, value) }))} />
    {isWeapon && <Field label="Dano" value={item.damage} onChange={(value) => mutate((draft) => assignById(draft.inventory, item.id, { damage: value }))} />}
    {isWeapon && <label className="field"><span>Bônus</span><output>{formatSigned(bonus.total)} → {composeItemDamageExpression(item.damage, bonus.total) || "—"}</output></label>}
    {isWeapon && <label className="field"><span>Perícia vinculada</span><select value={item.skillId} onChange={(event) => mutate((draft) => assignById(draft.inventory, item.id, { skillId: event.target.value }))}><option value="">Nenhuma</option>{testSources.map((source) => <option key={source.id} value={source.id}>{source.kind === "skill" ? source.name : `${source.name} · Elemento`}</option>)}</select></label>}
    {hasDefense && <NumberField label="RDF" value={item.rdf} onChange={(value) => mutate((draft) => assignById(draft.inventory, item.id, { rdf: value }))} />}
    {hasDefense && <NumberField label="RDM" value={item.rdm} onChange={(value) => mutate((draft) => assignById(draft.inventory, item.id, { rdm: value }))} />}
    {item.type === "shield" && <NumberField label="PR atual" value={item.prCurrent ?? 0} min={0} onChange={(value) => mutate((draft) => assignById(draft.inventory, item.id, { prCurrent: value }))} />}
    {item.type === "shield" && <NumberField label="PR máximo" value={item.prMaximum ?? 0} min={0} onChange={(value) => mutate((draft) => assignById(draft.inventory, item.id, { prMaximum: value }))} />}
    <div className="item-attachments-grid">
      <ItemAttachments kind="ability" attached={item.abilityIds.flatMap((id) => character.abilities.filter((ability) => ability.id === id).map(abilityAttachment))} available={character.abilities.map(abilityAttachment)} onAttach={(id) => attach("abilityIds", id)} onDetach={(id) => detach("abilityIds", id)} onCreate={(record) => createRecord("ability", record)} />
      <ItemAttachments kind="spell" attached={item.spellIds.flatMap((id) => character.spells.filter((spell) => spell.id === id).map(spellAttachment))} available={character.spells.map(spellAttachment)} onAttach={(id) => attach("spellIds", id)} onDetach={(id) => detach("spellIds", id)} onCreate={(record) => createRecord("spell", record)} />
    </div>
    <RichTextEditor label="Descrição" value={item.description} onChange={(description) => mutate((draft) => assignById(draft.inventory, item.id, { description }))} className="wide" />
  </div>
}

function LinkedPanel({ title, count, actions, children, className = "", listClassName = "linked-list" }: { title: string; count: number; actions: React.ReactNode; children: React.ReactNode; className?: string; listClassName?: string }) {
  return <div className={`linked-panel ${className}`}><header><div><strong>{title}</strong><span>{count} {count === 1 ? "vinculado" : "vinculados"}</span></div>{actions}</header><div className={listClassName}>{children}</div></div>
}

function assignById<T extends { id: string }>(items: T[], itemId: string, updates: Partial<T>) { const item = items.find((candidate) => candidate.id === itemId); if (item) Object.assign(item, updates) }
function createQuickAbility(name: string, category: string): Character["abilities"][number] { return { id: id("ability"), category, name, description: "", permanentModifiers: "", costType: "none", costMode: "fixed", costValue: 0, costText: "" } }
function createQuickSpell(): CharacterSpell { return { id: id("spell"), category: "Elemental", name: "Nova magia", description: "", costType: "none", costMode: "fixed", costValue: 0, costText: "", magicType: "spell", rangeType: "personal", rangeText: "", area: "", duration: "", castingSkill: "" } }
function createQuickItem(name: string, usage: Character["inventory"][number]["usage"], type: Character["inventory"][number]["type"]): Character["inventory"][number] { return { id: id("item"), usage, name, type, affinity: 0, bondPoints: 0, baseWeight: 0, size: 0, mt: 0, quantity: 1, applyScaleWeight: false, damage: "", rdf: 0, rdm: 0, equippedAsArmor: false, prCurrent: null, prMaximum: null, abilityIds: [], spellIds: [], bondId: "", skillId: "", description: "" } }

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label> }
function PercentField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="field percent-field"><span>{label}</span><span className="percent-input"><input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value.replace(/%/g, ""))} /><b>%</b></span></label> }
function DeferredNumberInput({ value, onChange, defaultValue = 0, min, max, ariaLabel, className }: { value: number | null; onChange: (value: number) => void; defaultValue?: number; min?: number; max?: number; ariaLabel?: string; className?: string }) {
  const [draft, setDraft] = useState(value === null ? "" : String(value))
  const [focused, setFocused] = useState(false)
  function commit(raw: string, blur = false) {
    setDraft(raw)
    if (raw === "" || raw === "+" || raw === "-") {
      if (blur) { setDraft(String(defaultValue)); onChange(defaultValue) }
      return
    }
    const parsed = Number(raw.replace(",", "."))
    if (!Number.isFinite(parsed)) return
    const bounded = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, parsed))
    onChange(bounded)
  }
  const displayed = focused ? draft : value === null ? "" : String(value)
  return <input className={className} aria-label={ariaLabel} inputMode="decimal" value={displayed} onFocus={() => { setDraft(value === null ? "" : String(value)); setFocused(true) }} onChange={(event) => commit(event.target.value)} onBlur={() => { commit(draft, true); setFocused(false) }} />
}
function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) { return <label className="field number-field"><span>{label}</span><DeferredNumberInput key={value} value={value} onChange={onChange} defaultValue={min ?? 0} min={min} max={max} /></label> }
function ResourceField({ label, value, maximum, onChange }: { label: string; value: number; maximum: number; onChange: (value: number) => void }) { return <label className="field number-field resource-field"><span>{label}</span><span className="resource-value"><DeferredNumberInput key={value} ariaLabel={`${label} atual`} value={value} onChange={onChange} /><output aria-label={`${label} máximo`}>/ {maximum}</output></span></label> }
function MasterySummary({ total, spent, remaining }: { total: number; spent: number; remaining: number }) { return <div className="mastery-summary" aria-label="Resumo dos pontos de melhoria"><span>Total <strong>{total}</strong></span><span>Usados <strong>{spent}</strong></span><span className={remaining < 0 ? "over" : ""}>Restantes <strong>{remaining}</strong></span></div> }
