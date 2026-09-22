"use client"
import type { ReactNode } from "react"
import type { KnowledgePage, KnowledgeTag, KnowledgeWorkspaceState } from "../lib/knowledge-model"
import { tagsForSection, tagCount } from "../lib/knowledge-tags"
import { TagGrid } from "./tag-grid"
import { EraManager } from "./era-manager"

export function WikiPortal({ state, section, onOpenTag, onCreateTag, onEditTag, onRemoveTag, onOpenPage, onCreateEra, onSaveEra, onDeleteEra, children }: { state: KnowledgeWorkspaceState; section: string; onOpenTag?: (tag: KnowledgeTag) => void; onCreateTag?: () => void; onEditTag?: (tag: KnowledgeTag) => void; onRemoveTag?: (tag: KnowledgeTag) => void; onOpenPage?: (page: KnowledgePage) => void; onCreateEra?: () => void; onSaveEra?: (era: KnowledgePage) => void; onDeleteEra?: (id: string) => void; children?: ReactNode }) {
  const tags = tagsForSection(state, section)
  if (section === "chronology") {
    const eras = state.pages.filter((page) => page.scope === "wiki" && page.kind === "chronology" && (page.eraStartYear != null || page.eraEndYear != null))
    return <><EraManager eras={eras} events={state.pages.filter((page) => page.scope === "wiki" && page.kind === "event")} onOpen={onOpenPage} onCreate={onCreateEra} onSave={onSaveEra} onDelete={onDeleteEra} />{children}</>
  }
  return <section className="wiki-portal"><header className="knowledge-heading"><div><p className="eyebrow">Wiki</p><h2>{section}</h2><p>Escolha uma tag para abrir as páginas vinculadas.</p></div></header><TagGrid tags={tags} counts={Object.fromEntries(tags.map((tag) => [tag.id, tag.name === "Sem Categoria" ? state.pages.filter((page) => page.scope === "wiki" && page.kind === section && page.tags.length === 0).length : tagCount(state, section, tag.name)]))} onSelect={onOpenTag} onCreate={onCreateTag} onEdit={onEditTag} onRemove={onRemoveTag} /></section>
}
