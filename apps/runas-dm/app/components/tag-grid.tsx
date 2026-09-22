"use client"
import type { KnowledgeTag } from "../lib/knowledge-model"
import { Building2, CircleHelp, Clock3, FolderOpen, Map, Package, PawPrint, Pencil, Tag as TagIcon, Trash2, UserRound } from "lucide-react"

const ICONS: Record<string, typeof TagIcon> = { Tag: TagIcon, Clock3, Map, UserRound, PawPrint, Package, Building2, FolderOpen }
function TagGlyph({ name, color }: { name: string; color: string }) { const Icon = ICONS[name] ?? (name ? TagIcon : CircleHelp); return <Icon size={30} style={{ color }} aria-hidden="true" /> }

export function TagGrid({ tags, counts, onSelect, onCreate, onEdit, onRemove }: { tags: KnowledgeTag[]; counts?: Record<string, number>; onSelect?: (tag: KnowledgeTag) => void; onCreate?: () => void; onEdit?: (tag: KnowledgeTag) => void; onRemove?: (tag: KnowledgeTag) => void }) {
  return <div className="knowledge-grid">{tags.map((tag) => <article className="knowledge-card tag-card" key={tag.id}><button className="tag-card-main" onClick={() => onSelect?.(tag)}><TagGlyph name={tag.icon} color={tag.color} /><strong>{tag.name}</strong><small>{counts?.[tag.id] ?? 0} {counts?.[tag.id] === 1 ? "página" : "páginas"}</small></button>{tag.id !== "__no-category__" && (onEdit || onRemove) && <footer><button aria-label={`Editar tag ${tag.name}`} onClick={() => onEdit?.(tag)}><Pencil size={14} /></button><button aria-label={`Remover tag ${tag.name}`} onClick={() => onRemove?.(tag)}><Trash2 size={14} /></button></footer>}</article>)}{onCreate && <button className="knowledge-card tag-card-create" onClick={onCreate}><TagIcon size={30} /><strong>Nova tag</strong><small>Fixar nesta categoria</small></button>}</div>
}
