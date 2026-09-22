"use client"
import type { KnowledgeTag } from "../lib/knowledge-model"
import { Pencil, Plus, Trash2 } from "lucide-react"

export function tagEmoji(value: string): string {
  if (/\p{Extended_Pictographic}/u.test(value)) return value
  return ({ Clock: "🕰️", Clock3: "🕰️", Map: "🗺️", UserRound: "🧙", PawPrint: "🐾", Package: "📦", Building2: "🏛️", FolderOpen: "📂" } as Record<string, string>)[value] ?? "🏷️"
}

export function TagGrid({ tags, counts, onSelect, onCreate, onEdit, onRemove }: { tags: KnowledgeTag[]; counts?: Record<string, number>; onSelect?: (tag: KnowledgeTag) => void; onCreate?: () => void; onEdit?: (tag: KnowledgeTag) => void; onRemove?: (tag: KnowledgeTag) => void }) {
  return <div className="knowledge-grid tag-grid">{tags.map((tag) => <article className="knowledge-card tag-card" key={tag.id}><button className="tag-card-main" onClick={() => onSelect?.(tag)}><span className="tag-emoji" aria-hidden="true">{tagEmoji(tag.icon)}</span><span className="tag-card-copy"><strong>{tag.name}</strong><small>{counts?.[tag.id] ?? 0} {counts?.[tag.id] === 1 ? "página" : "páginas"}</small></span></button>{tag.id !== "__no-category__" && (onEdit || onRemove) && <footer><button aria-label={`Editar tag ${tag.name}`} onClick={() => onEdit?.(tag)}><Pencil size={14} /></button><button aria-label={`Remover tag ${tag.name}`} onClick={() => onRemove?.(tag)}><Trash2 size={14} /></button></footer>}</article>)}{onCreate && <button className="knowledge-card tag-card-create" onClick={onCreate}><Plus size={18} /><strong>Nova tag</strong></button>}</div>
}
