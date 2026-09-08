"use client"

import { useMemo, useState } from "react"
import { BookOpen, ExternalLink, Link2, Minus, Plus, Save, Search, Swords, Trash2, X } from "lucide-react"
import type { BestiaryEntry } from "../lib/model"
import {
  CAMPAIGN_PAGE_KINDS,
  CAMPAIGN_STATUSES,
  WIKI_SECTIONS,
  parseList,
  missionOrderLinks,
  normalizeMissionOrder,
  type KnowledgeCategory,
  type KnowledgePage,
} from "../lib/knowledge-model"
import { ExpandableTextarea } from "./expandable-textarea"
import { RichTextEditor } from "./rich-text-editor"
import { fictionalYear, type UniverseEra } from "../lib/chronology"
import { KnowledgeImagePicker } from "./knowledge-image-picker"

function kindLabel(kind: string): string {
  return WIKI_SECTIONS.find((item) => item.id === kind)?.label
    ?? CAMPAIGN_PAGE_KINDS.find((item) => item.id === kind)?.label
    ?? kind
}

export function KnowledgeEditor({
  page,
  eras,
  pages,
  categories,
  bestiary,
  backlinks,
  onSave,
  onDelete,
  onClose,
  onLaunchEncounter,
}: {
  page: KnowledgePage
  eras: UniverseEra[]
  pages: KnowledgePage[]
  categories: KnowledgeCategory[]
  bestiary: BestiaryEntry[]
  backlinks: KnowledgePage[]
  onSave: (page: KnowledgePage) => void
  onDelete: (id: string) => void
  onClose: () => void
  onLaunchEncounter: (page: KnowledgePage) => void
}) {
  const [draft, setDraft] = useState<KnowledgePage>(() => structuredClone(page))
  const [yearText, setYearText] = useState(String(page.eventYear ?? ""))
  const [tagText, setTagText] = useState(() => page.tags.join(", "))
  const [relationSearch, setRelationSearch] = useState("")
  const [error, setError] = useState("")
  const automaticLinks = missionOrderLinks(draft, pages)
  const relatedPages = useMemo(
    () => pages.filter((candidate) => candidate.id !== draft.id && (
      !relationSearch.trim()
      || candidate.title.toLocaleLowerCase("pt-BR").includes(relationSearch.trim().toLocaleLowerCase("pt-BR"))
    )),
    [draft.id, pages, relationSearch],
  )
  const isEncounter = draft.scope === "campaign" && draft.kind === "encounter"
  const supportsSheet = draft.scope === "wiki" && ["characters", "fauna", "monsters"].includes(draft.kind)
  const hasStatus = draft.scope === "campaign" && ["mission", "event"].includes(draft.kind)
  const creatureTotal = draft.encounterCreatures.reduce((sum, item) => sum + item.quantity, 0)

  function patch(values: Partial<KnowledgePage>) {
    setDraft((current) => ({ ...current, ...values, updatedAt: Date.now() }))
  }

  function toggleValue(field: "categoryIds" | "linkedPageIds", value: string) {
    setDraft((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
      updatedAt: Date.now(),
    }))
  }

  function addEncounterCreature(entryId: string) {
    const entry = bestiary.find((candidate) => candidate.id === entryId)
    if (!entry) return
    setDraft((current) => {
      const existing = current.encounterCreatures.find((item) => item.entryId === entryId)
      return {
        ...current,
        encounterCreatures: existing
          ? current.encounterCreatures.map((item) => item.entryId === entryId
            ? { ...item, quantity: Math.min(99, item.quantity + 1) }
            : item)
          : [...current.encounterCreatures, {
            entryId,
            name: entry.character.name || "Criatura sem nome",
            quantity: 1,
          }],
        updatedAt: Date.now(),
      }
    })
  }

  function save() {
    if (draft.kind === "chronology" && yearText.trim() && fictionalYear(yearText) == null) { setError("Informe um ano inteiro, como -4725, 0 ou 4027."); return }
    if (draft.order && !normalizeMissionOrder(draft.order)) { setError("Use uma ordem como 1, 2, 3.1 ou 3.2."); return }
    onSave({ ...draft, eventYear: fictionalYear(yearText), tags: parseList(tagText), updatedAt: Date.now() })
  }

  function saveAndLaunchEncounter() {
    const ready = { ...draft, tags: parseList(tagText), updatedAt: Date.now() }
    onSave(ready)
    onLaunchEncounter(ready)
  }

  const deleteLabel = isEncounter ? "Excluir encontro" : "Excluir página"
  const saveLabel = isEncounter ? "Salvar encontro" : "Salvar alterações"

  return <div
    className="knowledge-modal-backdrop"
    role="presentation"
    onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}
  >
    <section className={`knowledge-editor ${isEncounter ? "encounter-editor" : ""}`} role="dialog" aria-modal="true" aria-labelledby="knowledge-editor-title">
      <header>
        <div>
          <p className="eyebrow">{draft.scope === "wiki" ? "Wiki" : "Campanha"} · {kindLabel(draft.kind)}</p>
          <h2 id="knowledge-editor-title">{draft.title || (isEncounter ? "Encontro sem nome" : "Página sem nome")}</h2>
        </div>
        <div>
          <button className="secondary-button" onClick={save}><Save size={16} /> Salvar</button>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
      </header>

      <div className="knowledge-editor-body">
        <main>
          <div className="knowledge-editor-identity">
            <label className="wide"><span>{isEncounter ? "Nome do encontro" : "Título"}</span><input value={draft.title} onChange={(event) => patch({ title: event.target.value })} /></label>
            <label><span>Tipo</span><select value={draft.kind} onChange={(event) => patch({ kind: event.target.value as KnowledgePage["kind"] })}>{draft.scope === "wiki" ? WIKI_SECTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>) : CAMPAIGN_PAGE_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            {draft.kind === "chronology" ? <>
              <label><span>Data de criação</span><input readOnly value={new Date(draft.createdAt).toLocaleDateString("pt-BR")} /></label>
              <label><span>Era</span><select value={draft.eraId || ""} onChange={(event) => patch({ eraId: event.target.value })}><option value="">Sem era definida</option>{eras.map((era) => <option key={era.id} value={era.id}>{era.name}</option>)}</select></label>
              <label><span>Ano do evento ({eras.find((era) => era.id === draft.eraId)?.calendar || "calendário fictício"})</span><input inputMode="numeric" value={yearText} onChange={(event) => setYearText(event.target.value)} placeholder="Ex.: -4725" /></label>
            </> : <label><span>Data</span><input type="date" value={draft.date} onChange={(event) => patch({ date: event.target.value })} /></label>}
            {draft.scope === "campaign" && ["mission", "event"].includes(draft.kind) && <label><span>Ordem</span><input value={draft.order || ""} onChange={(event) => patch({ order: event.target.value })} placeholder="3.1" /></label>}
            {hasStatus && <label><span>Status</span><select value={draft.status} onChange={(event) => patch({ status: event.target.value as KnowledgePage["status"] })}>{CAMPAIGN_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>}
            {!isEncounter && <label className="wide"><span>Resumo</span><ExpandableTextarea resizeKey={draft.id} value={draft.summary} onChange={(event) => patch({ summary: event.target.value })} placeholder="Uma visão rápida para encontrar esta página depois." /></label>}
            <label><span>Tags</span><input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="emboscada, floresta, nível alto" /></label>
          </div>

          {isEncounter ? <>
            <label className="encounter-notes-field">
              <span>Notas do mestre</span>
              <ExpandableTextarea
                resizeKey={draft.id}
                value={draft.summary}
                onChange={(event) => patch({ summary: event.target.value })}
                placeholder="Anote somente o necessário para reconhecer e conduzir este encontro."
              />
            </label>
            <section className="encounter-builder">
              <header>
                <div>
                  <p className="eyebrow">Composição pronta</p>
                  <h3>Inimigos do encontro</h3>
                  <p>{creatureTotal === 0 ? "Nenhum inimigo selecionado." : `${creatureTotal} ${creatureTotal === 1 ? "inimigo pronto" : "inimigos prontos"} para a mesa.`}</p>
                </div>
                <select defaultValue="" onChange={(event) => { addEncounterCreature(event.target.value); event.currentTarget.value = "" }}>
                  <option value="" disabled>Adicionar do bestiário…</option>
                  {bestiary.map((entry) => <option key={entry.id} value={entry.id}>{entry.character.name || "Criatura sem nome"}</option>)}
                </select>
              </header>
              <div>{draft.encounterCreatures.length === 0
                ? <p className="mini-empty">Adicione uma ficha do Bestiário para montar este encontro.</p>
                : draft.encounterCreatures.map((reference) => {
                  const entry = bestiary.find((candidate) => candidate.id === reference.entryId)
                  return <article key={reference.entryId}>
                    <span className={`encounter-creature-portrait ${entry?.character.portraitDataUrl ? "has-portrait" : ""}`}>
                      {entry?.character.portraitDataUrl ? <img src={entry.character.portraitDataUrl} alt="" /> : <Swords size={18} />}
                    </span>
                    <span className="encounter-creature-name"><strong>{reference.name}</strong><small>Ficha do bestiário</small></span>
                    <div>
                      <button aria-label={`Diminuir quantidade de ${reference.name}`} onClick={() => patch({ encounterCreatures: draft.encounterCreatures.map((item) => item.entryId === reference.entryId ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item) })}><Minus size={14} /></button>
                      <b aria-label={`${reference.quantity} cópias`}>{reference.quantity}</b>
                      <button aria-label={`Aumentar quantidade de ${reference.name}`} onClick={() => patch({ encounterCreatures: draft.encounterCreatures.map((item) => item.entryId === reference.entryId ? { ...item, quantity: Math.min(99, item.quantity + 1) } : item) })}><Plus size={14} /></button>
                      <button className="danger-icon" aria-label={`Remover ${reference.name}`} onClick={() => patch({ encounterCreatures: draft.encounterCreatures.filter((item) => item.entryId !== reference.entryId) })}><Trash2 size={14} /></button>
                    </div>
                  </article>
                })}</div>
              {draft.encounterCreatures.length > 0 && <button className="primary-button encounter-launch" onClick={saveAndLaunchEncounter}><ExternalLink size={16} /> Salvar e abrir na Mesa</button>}
            </section>
          </> : <RichTextEditor label="Conteúdo da página" value={draft.contentHtml} onChange={(contentHtml) => patch({ contentHtml })} wikiPageTitles={pages.filter((candidate) => candidate.id !== draft.id).map((candidate) => candidate.title)} className="knowledge-rich-editor" />}
        </main>

        <aside>
          {!isEncounter && <section>
            <header><Link2 size={16} /><strong>Vínculos</strong></header>
            {automaticLinks.length > 0 && <div className="backlinks"><b>Automáticos pela ordem</b>{pages.filter((candidate) => automaticLinks.includes(candidate.id)).map((candidate) => <span key={candidate.id}>{candidate.order} · {candidate.title}</span>)}</div>}
            <label className="mini-search"><Search size={14} /><input value={relationSearch} onChange={(event) => setRelationSearch(event.target.value)} placeholder="Buscar página" /></label>
            <div className="relation-list">{relatedPages.slice(0, 30).map((candidate) => <label key={candidate.id}><input type="checkbox" checked={draft.linkedPageIds.includes(candidate.id)} onChange={() => toggleValue("linkedPageIds", candidate.id)} /><span><strong>{candidate.title}</strong><small>{kindLabel(candidate.kind)}</small></span></label>)}</div>
            {backlinks.length > 0 && <div className="backlinks"><b>Ligam para esta página</b>{backlinks.map((candidate) => <span key={candidate.id}>[[{candidate.title}]]</span>)}</div>}
          </section>}
          <section>
            <header><BookOpen size={16} /><strong>Categorias</strong></header>
            <div className="relation-list">{categories.length === 0 ? <p className="mini-empty">Crie categorias na tela principal.</p> : categories.map((category) => <label key={category.id}><input type="checkbox" checked={draft.categoryIds.includes(category.id)} onChange={() => toggleValue("categoryIds", category.id)} /><span><strong>{category.name}</strong></span></label>)}</div>
          </section>
          {draft.scope === "campaign" && ["mission", "event"].includes(draft.kind) && <section><header><BookOpen size={16} /><strong>Imagem {draft.kind === "mission" ? "da missão" : "do evento"}</strong></header><KnowledgeImagePicker value={draft.backgroundImageDataUrl || ""} onChange={(backgroundImageDataUrl) => patch({ backgroundImageDataUrl })} /></section>}
          {supportsSheet && <section>
            <header><BookOpen size={16} /><strong>Ficha vinculada</strong></header>
            <label className="aside-select"><span>Bestiário</span><select value={draft.bestiaryEntryId ?? ""} onChange={(event) => patch({ bestiaryEntryId: event.target.value || null })}><option value="">Nenhuma ficha</option>{bestiary.map((entry) => <option key={entry.id} value={entry.id}>{entry.character.name || "Criatura sem nome"}</option>)}</select></label>
          </section>}
          {isEncounter && <div className="encounter-side-hint"><Swords size={20} /><strong>Pronto para a Mesa</strong><p>Ao abrir, as fichas atuais da Mesa serão substituídas por cópias independentes deste conjunto.</p></div>}
        </aside>
      </div>

      <footer>
        <button className="secondary-button danger-icon" onClick={() => { if (window.confirm(`${deleteLabel}?`)) onDelete(draft.id) }}><Trash2 size={16} /> {deleteLabel}</button>
        {error ? <p role="alert">{error}</p> : <span />}
        <button className="secondary-button" onClick={onClose}>Cancelar</button>
        <button className="primary-button" onClick={save}><Save size={16} /> {saveLabel}</button>
      </footer>
    </section>
  </div>
}
