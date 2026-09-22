"use client"
import type { KnowledgeTag } from "../lib/knowledge-model"
export function TagGrid({ tags, counts, onSelect, onCreate }: { tags: KnowledgeTag[]; counts?: Record<string, number>; onSelect?: (tag: KnowledgeTag) => void; onCreate?: () => void }) {
  return <div className="knowledge-grid">{tags.map((tag) => <button className="knowledge-card" key={tag.id} onClick={() => onSelect?.(tag)}><span style={{ color: tag.color }}>{tag.icon}</span><strong>{tag.name}</strong><small>{counts?.[tag.id] ?? 0} páginas</small></button>)}{onCreate && <button className="knowledge-card" onClick={onCreate}><strong>+ Nova tag</strong></button>}</div>
}

