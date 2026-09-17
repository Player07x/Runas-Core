"use client"

import { useState } from "react"
import { ArrowLeft, ChevronDown, ChevronUp, Edit3, Plus, Trash2 } from "lucide-react"
import type { BestiaryEntry } from "../lib/model"
import { createKnowledgePage, storyEventsOf, type KnowledgeCategory, type KnowledgePage } from "../lib/knowledge-model"
import { formatFictionalYear, type UniverseEra } from "../lib/chronology"
import { ExpandableTextarea } from "./expandable-textarea"
import { KnowledgeEditor } from "./knowledge-editor"
import { RichTextView } from "./rich-text-editor"

/** O acontecimento é datado pelo calendário fictício, nunca pela data real de criação do arquivo. */
function fictionalDate(event: KnowledgePage, eras: UniverseEra[]): string {
  const era = eras.find((candidate) => candidate.id === event.eraId)
  if (event.eventYear == null) return era ? era.name : ""
  const year = formatFictionalYear(event.eventYear, era?.calendar)
  return era ? `${year} · ${era.name}` : year
}

/**
 * Uma História não é escrita como texto: ela é a sequência de acontecimentos
 * que o mestre cria, reordena e apaga aqui. O corpo da página é sempre
 * derivado dessa lista — no vault ele vira os tópicos `- [[Acontecimento]]`,
 * enquanto esta tela mostra o conteúdo inteiro de cada um no lugar do link.
 * Editar acontece dentro do próprio documento, sem sobreposição.
 */
export function StoryDocument({
  story,
  pages,
  categories,
  eras,
  bestiary,
  onChangeStory,
  onDeleteStory,
  onSaveEvent,
  onDeleteEvent,
  onMoveEvent,
  onBack,
}: {
  story: KnowledgePage
  pages: KnowledgePage[]
  categories: KnowledgeCategory[]
  eras: UniverseEra[]
  bestiary: BestiaryEntry[]
  onChangeStory: (values: Partial<KnowledgePage>) => void
  onDeleteStory: () => void
  onSaveEvent: (event: KnowledgePage) => void
  onDeleteEvent: (id: string) => void
  onMoveEvent: (id: string, offset: -1 | 1) => void
  onBack: () => void
}) {
  const [editing, setEditing] = useState<KnowledgePage | null>(null)
  const events = storyEventsOf(story, pages)
  const isNewEvent = editing != null && !story.storyEventIds.includes(editing.id)

  function createEvent() {
    // O acontecimento novo continua na era do anterior: uma história raramente
    // salta de era a cada passo.
    setEditing({ ...createKnowledgePage("wiki", "event", null), title: "", eraId: events[events.length - 1]?.eraId ?? "" })
  }

  function saveEvent(event: KnowledgePage) {
    onSaveEvent(event)
    setEditing(null)
  }

  function inlineEditor(event: KnowledgePage) {
    return <KnowledgeEditor
      variant="inline"
      key={event.id}
      page={event}
      eras={eras}
      pages={pages}
      categories={categories}
      bestiary={bestiary}
      backlinks={[]}
      onSave={saveEvent}
      onDelete={(id) => { setEditing(null); if (story.storyEventIds.includes(id)) onDeleteEvent(id) }}
      onClose={() => setEditing(null)}
      onLaunchEncounter={() => undefined}
    />
  }

  return <article className="story-document">
    <header className="story-heading">
      <button className="secondary-button" onClick={onBack}><ArrowLeft size={16} /> Voltar às histórias</button>
      <div className="story-heading-copy">
        <p className="eyebrow">História · {events.length === 1 ? "1 acontecimento" : `${events.length} acontecimentos`}</p>
        <input className="story-title-input" value={story.title} onChange={(event) => onChangeStory({ title: event.target.value })} aria-label="Título da história" placeholder="Nome da história" />
        <ExpandableTextarea resizeKey={story.id} value={story.summary} onChange={(event) => onChangeStory({ summary: event.target.value })} placeholder="Do que esta história trata? Este resumo aparece no cartão e no arquivo do vault." />
      </div>
      <button className="icon-button danger-icon" title="Excluir história" aria-label="Excluir história" onClick={onDeleteStory}><Trash2 size={17} /></button>
    </header>

    <div className="story-events">
      {events.length === 0 && !editing && <div className="knowledge-empty story-empty">
        <strong>Esta história ainda não tem acontecimentos.</strong>
        <p>Uma história é escrita criando acontecimentos: cada um vira seu próprio registro, e a página guarda apenas a ordem deles.</p>
        <button className="primary-button" onClick={createEvent}><Plus size={16} /> Criar acontecimento</button>
      </div>}

      {events.map((event, index) => {
        if (editing?.id === event.id) return inlineEditor(editing)
        const dateLabel = fictionalDate(event, eras)
        return <section className="story-event" key={event.id}>
          <header>
            <div>
              <p className="eyebrow">Acontecimento {index + 1}{dateLabel ? ` · ${dateLabel}` : ""}</p>
              <h2>{event.title || "Acontecimento sem nome"}</h2>
              {event.summary && <p className="story-event-summary">{event.summary}</p>}
            </div>
            <div className="story-event-actions">
              <button className="icon-button subtle" disabled={index === 0} title="Mover para cima" aria-label={`Mover “${event.title || "acontecimento"}” para cima`} onClick={() => onMoveEvent(event.id, -1)}><ChevronUp size={17} /></button>
              <button className="icon-button subtle" disabled={index === events.length - 1} title="Mover para baixo" aria-label={`Mover “${event.title || "acontecimento"}” para baixo`} onClick={() => onMoveEvent(event.id, 1)}><ChevronDown size={17} /></button>
              <button className="icon-button subtle" title="Editar acontecimento" aria-label={`Editar “${event.title || "acontecimento"}”`} onClick={() => setEditing(event)}><Edit3 size={16} /></button>
              <button className="icon-button subtle danger-icon" title="Excluir acontecimento" aria-label={`Excluir “${event.title || "acontecimento"}”`} onClick={() => { if (window.confirm(`Excluir o acontecimento “${event.title || "sem nome"}”? O arquivo dele também sai do vault.`)) onDeleteEvent(event.id) }}><Trash2 size={16} /></button>
            </div>
          </header>
          {event.backgroundImageDataUrl && <img className="story-event-image" src={event.backgroundImageDataUrl} alt="" />}
          {event.contentHtml
            ? <RichTextView html={event.contentHtml} className="story-event-content" />
            : <p className="mini-empty">Acontecimento sem texto. Use “Editar acontecimento” para escrevê-lo.</p>}
          {event.tags.length > 0 && <footer className="story-event-tags">{event.tags.map((tag) => <i key={tag}>#{tag}</i>)}</footer>}
        </section>
      })}

      {isNewEvent && editing && inlineEditor(editing)}

      {!editing && events.length > 0 && <button className="primary-button story-add-event" onClick={createEvent}><Plus size={16} /> Criar acontecimento</button>}
    </div>
  </article>
}
