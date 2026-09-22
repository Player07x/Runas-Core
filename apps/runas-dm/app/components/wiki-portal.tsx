"use client"
import type { KnowledgePage, KnowledgeTag, KnowledgeWorkspaceState } from "../lib/knowledge-model"
import { tagsForSection, tagCount } from "../lib/knowledge-tags"
import { TagGrid } from "./tag-grid"
import { EraManager } from "./era-manager"
import { WIKI_SECTIONS, chronologyEraPages } from "../lib/knowledge-model"

export function WikiPortal({ state, section, onOpenTag, onCreateTag, onEditTag, onRemoveTag, onOpenPage, onCreateEra, onSaveEra, onDeleteEra }: { state: KnowledgeWorkspaceState; section: string; onOpenTag?: (tag: KnowledgeTag) => void; onCreateTag?: () => void; onEditTag?: (tag: KnowledgeTag) => void; onRemoveTag?: (tag: KnowledgeTag) => void; onOpenPage?: (page: KnowledgePage) => void; onCreateEra?: () => void; onSaveEra?: (era: KnowledgePage) => void; onDeleteEra?: (id: string) => void }) {
  const tags = tagsForSection(state, section)
  if (section === "chronology") {
    const eras = chronologyEraPages(state)
    return <div className="chronology-root"><EraManager eras={eras} events={state.pages.filter((page) => page.scope === "wiki" && page.kind === "event")} onOpen={onOpenPage} onCreate={onCreateEra} onSave={onSaveEra} onDelete={onDeleteEra} /></div>
  }
  return <section className="wiki-portal"><h2 className="section-title">{WIKI_SECTIONS.find((item) => item.id === section)?.label ?? section}</h2><TagGrid tags={tags} counts={Object.fromEntries(tags.map((tag) => [tag.id, tag.name === "Sem Categoria" ? state.pages.filter((page) => page.scope === "wiki" && page.kind === section && page.tags.length === 0).length : tagCount(state, section, tag.name)]))} onSelect={onOpenTag} onCreate={onCreateTag} onEdit={onEditTag} onRemove={onRemoveTag} /></section>
}
